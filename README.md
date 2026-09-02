# Kassasystem

### Run

`docker-compose up -d`

### Build

A devx build environment is required for multi platform build support, if you have none then create it using

`docker buildx create  --name container-builder --driver docker-container --bootstrap --use`

then run `deploy.sh -t <tag>`
