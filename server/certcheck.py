"""Validació en línia d'un certificat de signatura: cadena de confiança contra la TSL espanyola i revocació per OCSP.

Només rep certificats (mai el document). Fa servir l'eina `openssl` del sistema i la biblioteca estàndard de Python.

- TSL: llista oficial de prestadors de confiança (https://tsl.digital.gob.es/TSL.xml). Se'n prenen els certificats
  dels serveis "CA/QC" (autoritats que emeten certificats qualificats) com a punts de confiança. Es baixa en
  arrencar i es refresca cada TSL_REFRESH_HOURS hores; si falla, es conserva l'última còpia bona.
- Cadena: `openssl verify -partial_chain` contra aquests certificats, a la data de la signatura si se'n dona.
- Revocació: consulta OCSP a l'adreça que porta el certificat, NOMÉS si la cadena és de confiança (així el servidor
  no fa peticions a adreces arbitràries). Les adreces que es descarreguen han de ser públiques (no xarxes locals).
"""
import base64
import ipaddress
import os
import re
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlparse

TSL_URL = os.environ.get('TSL_URL', 'https://tsl.digital.gob.es/TSL.xml')
TSL_REFRESH_HOURS = float(os.environ.get('TSL_REFRESH_HOURS', '24'))
# On es desa la TSL: amb un volum persistent, després d'un reinici es fa servir l'última còpia bona de seguida
TSL_PEM = os.environ.get('TSL_CACHE', os.path.join(tempfile.gettempdir(), 'afirma-tsl.pem'))
NET_TIMEOUT = 10
MAX_CERTS = 10
MAX_CERT_BYTES = 16 * 1024
_TSL_NS = '{http://uri.etsi.org/02231/v2#}'

_tsl = {'count': 0, 'loaded': None, 'error': None}
_tsl_lock = threading.Lock()


def _pem(der):
    b = base64.b64encode(der).decode()
    return '-----BEGIN CERTIFICATE-----\n' + '\n'.join(b[i:i + 64] for i in range(0, len(b), 64)) + '\n-----END CERTIFICATE-----\n'


def _run(*args, stdin=None, timeout=30):
    return subprocess.run(args, input=stdin, capture_output=True, text=True, timeout=timeout)


def _load_tsl():
    xml = urllib.request.urlopen(TSL_URL, timeout=60).read()
    root = ET.fromstring(xml)
    pems = []
    for svc in root.iter(_TSL_NS + 'TSPService'):
        info = svc.find(_TSL_NS + 'ServiceInformation')
        if info is None or not (info.findtext(_TSL_NS + 'ServiceTypeIdentifier') or '').endswith('/Svctype/CA/QC'):
            continue
        for x in info.iter(_TSL_NS + 'X509Certificate'):
            b64 = re.sub(r'\s+', '', x.text or '')
            if b64:
                pems.append(_pem(base64.b64decode(b64)))
    pems = list(dict.fromkeys(pems))
    if len(pems) < 10:
        raise ValueError('TSL amb massa pocs certificats (%d)' % len(pems))
    tmp = TSL_PEM + '.new'
    with open(tmp, 'w') as f:
        f.write(''.join(pems))
    os.replace(tmp, TSL_PEM)
    with _tsl_lock:
        _tsl.update(count=len(pems), loaded=time.time(), error=None)
    return len(pems)


def start_tsl_updater(log=print):
    """Baixa la TSL en segon pla i la refresca periòdicament (no bloqueja l'arrencada del servidor)."""
    # còpia desada d'una execució anterior: es fa servir mentre no se'n baixa una de nova
    try:
        with open(TSL_PEM) as f:
            n = f.read().count('-----BEGIN CERTIFICATE-----')
        if n >= 10:
            with _tsl_lock:
                _tsl.update(count=n, loaded=os.path.getmtime(TSL_PEM))
            log('TSL desada: %d autoritats qualificades' % n)
    except OSError:
        pass

    def loop():
        fails = 0
        while True:
            try:
                n = _load_tsl()
                log('TSL carregada: %d autoritats qualificades' % n)
                fails = 0
                wait = TSL_REFRESH_HOURS * 3600
            except Exception as e:  # es conserva la còpia anterior; es reintenta aviat
                with _tsl_lock:
                    _tsl['error'] = str(e)[:200]
                log('TSL: error en baixar-la: %s' % str(e)[:200])
                fails += 1
                wait = 60 if fails <= 10 else 600  # després d'un reinici la xarxa pot trigar a estar a punt
            time.sleep(wait)
    threading.Thread(target=loop, daemon=True).start()


def _public_url(url):
    """Només http(s) a ports 80/443 i hosts que resolguin a adreces públiques (evita accedir a la xarxa local)."""
    u = urlparse(url)
    if u.scheme not in ('http', 'https') or not u.hostname or (u.port not in (None, 80, 443)):
        return False
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or (443 if u.scheme == 'https' else 80))
    except OSError:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def _x509(path, *opts):
    r = _run('openssl', 'x509', '-in', path, '-noout', *opts)
    return r.stdout.strip() if r.returncode == 0 else ''


def _subjects(pem_text):
    """Llista de subjectes (format per defecte d'openssl), en ordre, d'un fitxer amb diversos certificats."""
    p7 = _run('openssl', 'crl2pkcs7', '-nocrl', '-certfile', '/dev/stdin', stdin=pem_text)
    if p7.returncode != 0:
        return []
    out = _run('openssl', 'pkcs7', '-print_certs', '-noout', stdin=p7.stdout)
    return [l[len('subject='):].strip() for l in out.stdout.splitlines() if l.startswith('subject=')]


def _split_pems(text):
    return re.findall(r'-----BEGIN CERTIFICATE-----.+?-----END CERTIFICATE-----\n?', text, re.S)


def _find_issuer(leaf_path, others_pem, d):
    """Cerca el certificat emissor entre els de la signatura, la TSL o, si cal, a l'adreça AIA del certificat."""
    issuer = _x509(leaf_path, '-issuer')
    issuer = issuer[len('issuer='):].strip() if issuer.startswith('issuer=') else issuer
    pool = others_pem
    try:
        with open(TSL_PEM) as f:
            pool += f.read()
    except OSError:
        pass
    blocks = _split_pems(pool)
    for subj, block in zip(_subjects(''.join(blocks)), blocks):
        if subj == issuer:
            return block
    aia = _x509(leaf_path, '-ext', 'authorityInfoAccess')
    m = re.search(r'CA Issuers - URI:(\S+)', aia)
    if m and _public_url(m.group(1)):
        try:
            data = urllib.request.urlopen(m.group(1), timeout=NET_TIMEOUT).read(MAX_CERT_BYTES * 4)
            if b'-----BEGIN CERTIFICATE-----' in data:
                return _split_pems(data.decode('ascii', 'replace'))[0]
            p = os.path.join(d, 'aia.der')
            with open(p, 'wb') as f:
                f.write(data)
            r = _run('openssl', 'x509', '-inform', 'DER', '-in', p)
            if r.returncode == 0:
                return r.stdout
        except Exception:
            pass
    return None


def _cn(dn):
    m = re.search(r'CN\s*=\s*([^,/]+)', dn or '')
    return m.group(1).strip() if m else (dn or '').strip()


def validate(certs_der, sign_time=None):
    """certs_der: llista de certificats DER (el primer és el del signant). sign_time: segons UNIX o None.
    Retorna un dict serialitzable a JSON amb 'chain' i 'revocation'."""
    res = {'chain': 'error', 'revocation': 'unchecked', 'checkedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    with _tsl_lock:
        res['tsl'] = {'count': _tsl['count'], 'loaded': _tsl['loaded'] and datetime.fromtimestamp(_tsl['loaded'], timezone.utc).isoformat(timespec='seconds')}
    if not certs_der or len(certs_der) > MAX_CERTS or any(len(c) > MAX_CERT_BYTES for c in certs_der):
        res['detail'] = 'certificats no vàlids'
        return res
    if not _tsl['count']:
        res['chain'] = 'unavailable'
        res['detail'] = 'la llista de confiança (TSL) encara no està disponible'
        return res
    with tempfile.TemporaryDirectory() as d:
        leaf = os.path.join(d, 'leaf.pem')
        with open(leaf, 'w') as f:
            f.write(_pem(certs_der[0]))
        if not _x509(leaf, '-subject'):
            res['detail'] = 'el certificat no es pot llegir'
            return res
        others = ''.join(_pem(c) for c in certs_der[1:])
        args = ['openssl', 'verify', '-partial_chain', '-show_chain', '-CAfile', TSL_PEM]
        if others:
            chain = os.path.join(d, 'chain.pem')
            with open(chain, 'w') as f:
                f.write(others)
            args += ['-untrusted', chain]
        if sign_time:
            args += ['-attime', str(int(sign_time))]
        r = _run(*(args + [leaf]))
        if r.returncode == 0:
            res['chain'] = 'ok'
            trusted = [l for l in r.stdout.splitlines() if l.startswith('depth=') and '(untrusted)' not in l]
            if trusted:
                res['anchor'] = _cn(trusted[0].split(':', 1)[1])
        else:
            m = re.search(r'error (\d+) at \d+ depth lookup: (.+)', r.stdout + r.stderr)
            # 2/20/21: no es troba cap emissor de confiança; 18/19: autosignat o arrel que no és a la TSL
            res['chain'] = 'untrusted' if m and m.group(1) in ('2', '18', '19', '20', '21') else 'invalid'
            res['detail'] = m.group(2).strip() if m else (r.stderr or r.stdout).strip()[-200:]
            return res  # sense cadena de confiança no es consulta l'OCSP

        url = _x509(leaf, '-ocsp_uri').splitlines()
        url = url[0].strip() if url else ''
        if not url:
            res['revocation'] = 'no-ocsp'
            return res
        res['ocsp'] = urlparse(url).hostname
        if not _public_url(url):
            res['revocation'] = 'error'
            res['detail'] = 'adreça OCSP no permesa'
            return res
        issuer = _find_issuer(leaf, others, d)
        if not issuer:
            res['revocation'] = 'error'
            res['detail'] = "no s'ha trobat el certificat de l'emissor"
            return res
        ip = os.path.join(d, 'issuer.pem')
        with open(ip, 'w') as f:
            f.write(issuer)
        try:
            o = _run('openssl', 'ocsp', '-issuer', ip, '-cert', leaf, '-url', url, '-CAfile', TSL_PEM, '-partial_chain',
                     '-timeout', str(NET_TIMEOUT), timeout=NET_TIMEOUT + 5)
        except subprocess.TimeoutExpired:
            res['revocation'] = 'error'
            res['detail'] = 'el servei OCSP no respon'
            return res
        out = o.stdout + '\n' + o.stderr
        st = re.search(re.escape(leaf) + r': (good|revoked|unknown)', out)
        if 'Response verify OK' not in out or not st:
            res['revocation'] = 'error'
            res['detail'] = 'resposta OCSP no vàlida o no verificable'
            return res
        res['revocation'] = st.group(1)
        m = re.search(r'Revocation Time: (.+)', out)
        if m:
            res['revokedAt'] = m.group(1).strip()
        m = re.search(r'Reason: (.+)', out)
        if m:
            res['reason'] = m.group(1).strip()
        return res
