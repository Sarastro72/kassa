/bin/bash -e

tag=test
push=false
setup_env=false

while getopts "pt:e" opt; do
  case $opt in
    p)
      push=true
      ;;
    t)
      tag=$OPTARG
      ;;
    e)
      setup_env=true
      ;;
    \?)
      echo "Invalid option: -$OPTARG"
      echo "usage: deploy.sh [-p] [-t <tagname>]"
      echo " -p push to ducker hub"
      echo " -t set tagname (default 'test')"
      exit
      ;;
  esac
done

if $push; then
  if $setup_env; then
    docker buildx create  --name container-builder --driver docker-container --bootstrap --use
  fi
  docker buildx build --platform linux/amd64,linux/arm64 -t sarastro72/kassa:$tag --push .
  echo "Deployed sarastro72/kassa:$tag to docker hub"
else
  docker build -t sarastro72/kassa:$tag . && \
  echo "Built sarastro72/kassa:$tag"
fi
