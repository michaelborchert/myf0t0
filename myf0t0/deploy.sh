#!/usr/bin/env bash

if [[ -n $1 ]]; then
  npx browserslist@latest --update-db -y

  npm run build

  BUCKET_NAME=$(aws s3api list-buckets --query 'Buckets[*].[Name]' --output text | grep "$1-appbucket")
  aws s3 sync ./build s3://$BUCKET_NAME
fi
