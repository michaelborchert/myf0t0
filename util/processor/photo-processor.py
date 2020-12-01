#!/usr/bin/env python

from PIL import Image
from PIL.ExifTags import TAGS
from dateutil import parser
import datetime
import pytz
import os

import boto3
import json

BUCKET_NAME = os.environ['photo_bucket']
THUMBNAIL_SIZE = 128, 128

def get_exif(im):
    ret = {}
    info = im._getexif()
    for tag, value in info.items():
        decoded = TAGS.get(tag, tag)
        ret[decoded] = value
    return ret

def handler(event, context):
    print(json.dumps(event, indent=2))
    print(BUCKET_NAME)

    s3 = boto3.resource('s3')


    for record in event['Records']:
        #Load object
        key = record["body"]
        filename = key.split("/")[-1]
        file_id = filename.split(".")[0]
        file_type = filename.split(".")[-1]

        #Only process JPEG images
        if file_type in ["jpg", "JPG", "jpeg", "JPEG"]:

            s3.Bucket(BUCKET_NAME).download_file(key, "/tmp/"+filename)

            #Generate and save thumbnail
            im = Image.open("/tmp/"+filename)
            exif_data = get_exif(im)
            print(exif_data)
            im.thumbnail(THUMBNAIL_SIZE)
            thumbnail_filename = file_id + ".thumbnail"
            im.save("/tmp/" + thumbnail_filename, "JPEG")
            thumbnail_key = "thmb/"+key
            s3.Bucket(BUCKET_NAME).upload_file("/tmp/"+thumbnail_filename, thumbnail_key)

            #Extract accessible EXIF data
            timestamp = datetime.datetime.strptime(exif_data["DateTimeOriginal"], "%Y:%m:%d %H:%M:%S")

            photo_id = file_id + " " + exif_data["DateTimeOriginal"]

            key = "https://{}.s3-ap-southeast-1.amazonaws.com/{}".format(BUCKET_NAME, key.replace(" ", "+"))
            thumbnail_key = "https://{}.s3-ap-southeast-1.amazonaws.com/{}".format(BUCKET_NAME, thumbnail_key.replace(" ", "+"))

            print(photo_id)
            print(timestamp)
            print(key)
            print(thumbnail_key)

            #Write record to Dynamo
            #TODO

    return {
          'message' : "Success!"
      }
