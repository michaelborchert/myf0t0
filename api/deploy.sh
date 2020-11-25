#!/usr/bin/env bash

rm function.zip
cd lib/python3.6/site-packages
zip -r9 ${OLDPWD}/function.zip *
cd $OLDPWD
zip -g function.zip app.py
aws s3 cp ./function.zip s3://myf0t0dist/api.zip
#aws lambda update-function-code --function-name photo-processor --zip-file fileb://function.zip --region us-east-2
