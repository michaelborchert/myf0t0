#!/usr/bin/env python
import boto3

BUCKET='borchert-photos'
QUEUE_URL='https://sqs.us-east-2.amazonaws.com/462212580231/photo-processing'

s3_client = boto3.client('s3')
sqs_client = boto3.client('sqs')

objects = s3_client.list_objects(Bucket=BUCKET, MaxKeys=10)
for object in objects["Contents"]:
    response = sqs_client.send_message(
        QueueUrl=QUEUE_URL,
        MessageBody=object["Key"]
    )
