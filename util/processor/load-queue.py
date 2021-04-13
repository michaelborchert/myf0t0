#!/usr/bin/env python
import boto3
import json
import sys

stackname = sys.argv[1]
bucketname = sys.argv[2]

queue_url='https://sqs.us-east-2.amazonaws.com/462212580231/'+stackname+'-ProcessingQueue'

s3_client = boto3.client('s3')
sqs_client = boto3.client('sqs')

# photo_bucket = ""
# buckets = s3_client.list_buckets()
# for bucket in buckets["Buckets"]:
#     print(bucket)
#     if (stackname+"-photobucket" in bucket["Name"]):
#         photo_bucket = bucket["Name"]


objects = s3_client.list_objects(Bucket=bucketname)
for object in objects["Contents"]:
    if object["Key"].startswith("img/") and object["Key"] != "img/":
        message = {"Records": [{"eventName":"ObjectCreated:Put", "s3": { "object": { "key": object["Key"]}}}]}
        response = sqs_client.send_message(
            QueueUrl=queue_url,
            MessageBody=json.dumps(message)
        )
