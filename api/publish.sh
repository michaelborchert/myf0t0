#!/usr/bin/env bash

rm function.zip
cd lib/python3.8/site-packages
zip -r9 ${OLDPWD}/function.zip *chalice* *dateutil* *yaml*
cd $OLDPWD
zip -g function.zip app.py
aws s3 cp ./function.zip s3://myf0t0dist/api.zip
aws s3api put-object-acl --acl public-read --bucket myf0t0dist --key api.zip