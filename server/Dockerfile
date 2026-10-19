FROM python:3.12-alpine
# openssl: validació de certificats (cadena contra la TSL i OCSP) a /afirma-validate
RUN apk add --no-cache openssl
WORKDIR /app
COPY relay.py certcheck.py ./
ENV PORT=8090
EXPOSE 8090
USER 1000:1000
CMD ["python", "-u", "relay.py"]
