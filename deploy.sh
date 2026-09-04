#!/bin/bash -e

tag=test
push=false
recreate=false
builder=container-builder

while getopts "prt:" opt; do
  case $opt in
    p)
      push=true
      ;;
    r)
      recreate=true
      ;;
    t)
      tag=$OPTARG
      ;;
    \?)
      echo "Invalid option: -$OPTARG"
      echo "usage: deploy.sh [-p] [-r] [-t <tagname>]"
      echo " -p push to docker hub"
      echo " -r recreate the buildx builder from scratch"
      echo " -t set tagname (default 'test')"
      exit
      ;;
  esac
done

# Multi-arch needs the docker-container driver, which the default builder is not.
# Point --builder at ours instead of --use, since Docker Desktop keeps resetting
# the default back to desktop-linux.
ensure_builder() {
  if $recreate; then
    docker buildx rm "$builder" > /dev/null 2>&1 || true
  fi
  # --bootstrap both verifies the builder and restarts its buildkit container
  # if that has been stopped or pruned away
  if ! docker buildx inspect --bootstrap "$builder" > /dev/null 2>&1; then
    echo "Creating buildx builder $builder"
    docker buildx create --name "$builder" --driver docker-container --bootstrap > /dev/null
  fi
}

if $push; then
  ensure_builder
  docker buildx build --builder "$builder" --platform linux/amd64,linux/arm64 -t sarastro72/kassa:$tag --push .
  echo "Deployed sarastro72/kassa:$tag to docker hub"
else
  docker build -t sarastro72/kassa:$tag . && \
  echo "Built sarastro72/kassa:$tag"
fi
