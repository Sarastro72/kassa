FROM node:22-alpine

WORKDIR /app

COPY server.js kassasystem.html display.html ./
COPY lib/ lib/
COPY static/ static/

EXPOSE 8080

CMD ["node", "server.js"]
