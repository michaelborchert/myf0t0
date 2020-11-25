#!/usr/bin/env bash

rm function.zip
cd lib/python3.6/site-packages
zip -r9 ${OLDPWD}/function.zip *PIL* *pil* *psycopg2* *dateutil* *pytz*
cd $OLDPWD
zip -g function.zip photo-processor.py
aws lambda update-function-code --function-name photo-processor --zip-file fileb://function.zip --region us-east-2
