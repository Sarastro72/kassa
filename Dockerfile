FROM nginx:alpine

WORKDIR /usr/share/nginx

COPY kassasystem.html html/index.html
COPY lib/ html/lib/
