"""Prova ràpida del servidor intermedi: python test_relay.py"""
import os
import subprocess
import sys
import time
import urllib.request

env = dict(os.environ, PORT='18090')
p = subprocess.Popen([sys.executable, 'relay.py'], env=env)
time.sleep(1)
base = 'http://127.0.0.1:18090'


def call(path, data=None):
    req = urllib.request.Request(base + path, data=data.encode() if data else None)
    return urllib.request.urlopen(req).read().decode()


try:
    assert call('/afirma-signature-storage/StorageService?op=check').strip() == 'OK'
    assert call('/afirma-signature-retriever/RetrieveService?op=check').strip() == 'OK'
    assert call('/afirma-signature-storage/StorageService', 'op=put&v=1_0&id=abcdefgh12345&dat=QUJD-_xx==').strip() == 'OK'
    r = call('/afirma-signature-retriever/RetrieveService', 'op=get&v=1_0&id=abcdefgh12345&it=0').strip()
    assert r == 'QUJD-_xx==', r
    assert call('/afirma-signature-retriever/RetrieveService', 'op=get&v=1_0&id=abcdefgh12345&it=1').startswith('ERR-06')
    print('OK')
finally:
    p.terminate()
