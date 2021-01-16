#!/usr/bin/env python

from PIL import Image
from PIL.ExifTags import TAGS
from dateutil import parser
import datetime
import pytz
import os

import boto3
import json
import hashlib

BUCKET_NAME = os.environ['photo_bucket']
THUMBNAIL_SIZE = 128, 128

s3 = boto3.resource('s3')
dynamo = boto3.client("dynamodb")

def get_exif(im):
    ret = {}
    info = im._getexif()
    for tag, value in info.items():
        decoded = TAGS.get(tag, tag)
        ret[decoded] = value
    return ret

def strip_prefix(text, prefix):
    if text.startswith(prefix):
        return text[len(prefix):]
    return text

def get_index_hash(filename):
    return int(hashlib.md5(filename.encode()).hexdigest(), 16)%4

# https://gist.github.com/JamieCressey/a3a75a397db092d7a70bbe876a6fb817
def dict_to_item(raw):
    if isinstance(raw, dict):
        return {
            'M': {
                k: dict_to_item(v)
                for k, v in raw.items()
            }
        }
    elif isinstance(raw, list):
        return {
            'L': [dict_to_item(v) for v in raw]
        }
    elif isinstance(raw, int):
        return {'N': str(raw)}
    elif isinstance(raw, bytes):
        return {'B': raw}
    else:
        return {'S': str(raw)}

def handler(event, context):
    print(json.dumps(event, indent=2))
    print(BUCKET_NAME)

    for sqs_record in event['Records']:
        s3_event = json.loads(sqs_record["body"])
        print(s3_event)
        for s3_record in s3_event["Records"]:
            #Load object
            print(s3_record)
            key = s3_record["s3"]["object"]["key"]
            stripped_key = strip_prefix(key, "img/")
            filename = stripped_key.split("/")[-1]
            file_id = filename.split(".")[0]
            file_type = filename.split(".")[-1]
            print(stripped_key + " " + filename + " " + file_id + " " + file_type)

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
                thumbnail_key = "thmb/"+stripped_key
                s3.Bucket(BUCKET_NAME).upload_file("/tmp/"+thumbnail_filename, thumbnail_key)

                #Extract accessible EXIF data
                timestamp = datetime.datetime.strptime(exif_data["DateTimeOriginal"], "%Y:%m:%d %H:%M:%S")

                photo_id = "{}_{}".format(timestamp.isoformat(), filename)

                key = "https://{}.s3-ap-southeast-1.amazonaws.com/{}".format(BUCKET_NAME, key.replace(" ", "+"))
                thumbnail_key = "https://{}.s3-ap-southeast-1.amazonaws.com/{}".format(BUCKET_NAME, thumbnail_key.replace(" ", "+"))

                print(photo_id)
                print(timestamp.isoformat())
                print(key)
                print(thumbnail_key)

                #Write record to Dynamo
                my_item = {
                    "PK": "photos{}".format(get_index_hash(filename)),
                    "SK": photo_id,
                    "GSI1PK": "None",
                    "GSI1SK": key,
                    "exif": exif_data
                }


                print(dict_to_item(exif_data))

                response = dynamo.put_item(
                        TableName=os.environ['db_name'],
                        Item={
                            "PK": {"S": "photos{}".format(get_index_hash(filename))},
                            "SK": {"S": photo_id},
                            "GSI1PK": {"S": "None"},
                            "GSI1SK": {"S": key},
                            "thumbnail_key": {"S": thumbnail_key},
                            "exif": dict_to_item(exif_data)
                        }
                    )
                print(response)

    return {
          'message' : "Success!"
      }
