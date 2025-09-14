tag=test
push=false

while getopts "pt:" opt; do
  case $opt in
    p)
      push=true
      ;;
    t)
      tag=$OPTARG
      ;;
    \?)
      echo "Invalid option: -$OPTARG"
      ;;
  esac
done

if $push; then
    docker buildx build --platform linux/amd64,linux/arm64 -t sarastro72/kassa:$tag --push .
    echo "Deployed sarastro72/kassa:$tag to docker hub"
else
    docker build -t sarastro72/kassa:$tag . && \
    echo "Built sarastro72/kassa:$tag"
fi
