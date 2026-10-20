FROM python:3.12-alpine
# openssl: validació de certificats (cadena contra la TSL i OCSP) a /afirma-validate
# /var/lib/afirma: còpia persistent de la TSL (volum), escrivible per l'usuari del servei
RUN apk add --no-cache openssl \
 && mkdir -p /var/lib/afirma && chown 1000:1000 /var/lib/afirma
WORKDIR /app
COPY relay.py certcheck.py ./
ENV PORT=8090
EXPOSE 8090
USER 1000:1000
CMD ["python", "-u", "relay.py"]
