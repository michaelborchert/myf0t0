#!/usr/bin/env python

from PIL import Image
from PIL.ExifTags import TAGS
from dateutil import parser
from urllib.parse import unquote_plus
import datetime
import pytz
import os

import boto3
from boto3.dynamodb.conditions import Key
import json
import hashlib


BUCKET_NAME = os.environ['photo_bucket']
THUMBNAIL_SIZE = 256, 256

s3 = boto3.resource('s3')
dynamo = boto3.client("dynamodb")
dynamo_resource = boto3.resource('dynamodb')

def get_exif(im):
    ret = {}
    info = im._getexif()
    for tag, value in info.items():
        try:
            decoded = TAGS.get(tag, tag)
        except:
            print("Failed to decode EXIF tag " + tag)

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
                str(k): dict_to_item(v)
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
        if "Records" not in s3_event:
            return {"message": "No Records."}

        for s3_record in s3_event["Records"]:
            #Load object
            try:
                handleS3Event(s3_record)
            except Exception as err:
                print(err)
                return {
                    "message": "Error."
                }

def handleS3Event(s3_record):
    print(s3_record)
    key = s3_record["s3"]["object"]["key"]
    key = unquote_plus(key)
    stripped_key = strip_prefix(key, "img/")
    filename = stripped_key.split("/")[-1]
    file_id = filename.split(".")[0]
    file_type = filename.split(".")[-1]
    print(key + " " + stripped_key + " " + filename + " " + file_id + " " + file_type)

    #Only process JPEG images
    if file_type in ["jpg", "JPG", "jpeg", "JPEG"]:
        if "ObjectCreated" in s3_record["eventName"]:
            processNewObject(key, filename, file_id, file_type)
        elif "ObjectRemoved" in s3_record["eventName"]:
            processDeletedObject(key)

    return {
        "message": "Event not processed."
    }

def processNewObject(key, filename, file_id, file_type):
    stripped_key = strip_prefix(key, "img/")

    s3.Bucket(BUCKET_NAME).download_file(key, "/tmp/"+filename)

    #Generate and save thumbnail
    im = Image.open("/tmp/"+filename)
    exif_data = get_exif(im)
    print(exif_data)
    im.thumbnail(THUMBNAIL_SIZE, Image.ANTIALIAS)
    thumbnail_filename = file_id + ".thumbnail"
    im.save("/tmp/" + thumbnail_filename, "JPEG", exif=im.info["exif"])
    thumbnail_key = "thmb/"+stripped_key
    s3.Bucket(BUCKET_NAME).upload_file(
        "/tmp/"+thumbnail_filename,
        thumbnail_key)

    #Extract accessible EXIF data
    timestamp = datetime.datetime.strptime(exif_data["DateTimeOriginal"], "%Y:%m:%d %H:%M:%S")

    photo_id = "{}_{}".format(timestamp.isoformat(), filename)

    key = "{}/img/{}".format(BUCKET_NAME, stripped_key)
    thumbnail_key = "{}/thmb/{}".format(BUCKET_NAME, stripped_key)
    print(photo_id)
    print(timestamp.isoformat())
    print(key)
    print(thumbnail_key)

    exif_item = dict_to_item(exif_data)

    print(exif_item)

    response = dynamo.put_item(
            TableName=os.environ['db_name'],
            Item={
                "PK": {"S": "photos{}".format(get_index_hash(filename))},
                "SK": {"S": photo_id},
                "GSI1PK": {"S": "0"},
                "GSI1SK": {"S": key},
                "thumbnail_key": {"S": thumbnail_key},
                "exif": exif_item
            }
        )
    print(response)

    return {
      'message' : "Successfully stored metadata and thumbnail!"
    }

def processDeletedObject(key):
    print(key)
    full_key = "{}/{}".format(BUCKET_NAME, key)
    table = dynamo_resource.Table(os.environ['db_name'])

    response = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key("GSI1PK").eq("None") & Key("GSI1SK").eq(full_key)
    )

    print(response)
    pk = response["Items"][0]["PK"]
    sk = response["Items"][0]["SK"]

    del_response = table.delete_item(
        Key={
            'PK': pk,
            'SK': sk
        }
    )

    stripped_key = strip_prefix(key, "img/")
    thumbnail_key = "thmb/"+stripped_key

    thumbnail = s3.Object(BUCKET_NAME, thumbnail_key)
    if thumbnail:
        thumbnail.delete();

    return {
      'message' : "Successfully removed metadata and thumbnail!"
    }
