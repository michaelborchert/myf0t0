#!/usr/bin/env bash

rm function.zip
cd lib/python3.6/site-packages
zip -r9 ${OLDPWD}/function.zip *PIL* *pil* *dateutil* *pytz*
cd $OLDPWD
zip -g function.zip photo-processor.py
aws s3 cp ./function.zip s3://myf0t0dist/photo-processor.zip