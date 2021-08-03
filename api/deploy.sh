#!/usr/bin/env bash

if [[ -n $1 ]]; then
  FUNCTION_NAME=$(aws lambda list-functions --query 'Functions[*].[FunctionName]' --output text | grep "$1-ApiFunction")
  aws lambda update-function-code --function-name $FUNCTION_NAME --s3-bucket myf0t0dist --s3-key api.zip
fi
