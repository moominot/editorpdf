FROM python:3.12-alpine
WORKDIR /app
COPY relay.py .
ENV PORT=8090
EXPOSE 8090
USER 1000:1000
CMD ["python", "-u", "relay.py"]
