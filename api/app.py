# from flask import Flask, jsonify, request, make_response
# from flask_lambda import FlaskLambda
# from flask_cors import CORS
# from flask_swagger import swagger

from chalice import Chalice, CORSConfig

import boto3

import datetime
import base64
import json
import os

#app = FlaskLambda(__name__)
#CORS(app)

app = Chalice(app_name='myf0t0-api')
app.api.cors = True
cors_config = CORSConfig(
    allow_origin='*',
    allow_credentials=True)

db_client = boto3.client('dynamodb')
s3_client = boto3.client('s3')

def photo_query(**kwargs):
    if (":partitionkeyval" in kwargs["ExpressionAttributeValues"].keys()):
        if (kwargs["ExpressionAttributeValues"][":partitionkeyval"].get("S", "Not Found") == "$photos"):
            output = {"Items": []}
            for x in range(0,4):
                kwargs["ExpressionAttributeValues"][":partitionkeyval"]["S"] = "photos"+str(x)
                response = db_client.query(**kwargs)
                output["Items"].extend(response["Items"])

            print(output)
            if "Limit" in kwargs.keys():
                output["Items"] = sorted(output["Items"], key=lambda i: i["SK"]["S"])[:int(kwargs["Limit"])]

            return output
    else:
        response =  db_client.query(**kwargs)
        return response

def item_to_dict(item):
    if isinstance(item, dict):
        output = {}
        for k,v in item.items():
            if isinstance(v, dict):
                if len(v.keys()) == 1:
                    type = list(v.keys())[0]
                    if type == "M":
                        output[k] = item_to_dict(v[type])
                    elif type == "B":
                        output[k] = str(base64.b64encode(v[type]))
                    else:
                        output[k] = str(v[type])
            else:
                output[k] = item_to_dict(v)
        return output
    else:
        output = []
        for sub_item in item:
            output.append(item_to_dict(sub_item))
        return output

def create_presigned_url(bucket_name, object_name, expiration=3600):
    """Generate a presigned URL to share an S3 object

    :param bucket_name: string
    :param object_name: string
    :param expiration: Time in seconds for the presigned URL to remain valid
    :return: Presigned URL as string. If error, returns None.
    """

    # Generate a presigned URL for the S3 object
    s3_client = boto3.client('s3')
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': bucket_name,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
    except ClientError as e:
        logging.error(e)
        return None

    # The response contains the presigned URL
    return response

@app.route("/", methods=['GET'])
def hello():
  return {"hello": "world"}

@app.route("/photo", methods=['GET'], cors=cors_config)
def get_photos():
    print(json.dumps(app.current_request.to_dict(), indent=2))

    expression_attribute_values = {":partitionkeyval":{"S": "$photos"}}

    query_params = app.current_request.to_dict().get("query_params")
    if not query_params:
        query_params = {}

    range_condition = ""
    if "start_date" in query_params.keys() and "end_date" in query_params.keys():
        range_condition = " AND SK BETWEEN :startdate AND :enddate"
        expression_attribute_values[":startdate"] = {"S": query_params["start_date"]}
        expression_attribute_values[":enddate"] = {"S": query_params["end_date"]}
    elif "start_date" in query_params.keys():
        range_condition = " AND SK > :startdate"
        expression_attribute_values[":startdate"] = {"S": query_params["start_date"]}
    elif "end_date" in query_params.keys():
        range_condition = " AND SK <= :enddate"
        expression_attribute_values[":enddate"] = {"S": query_params["end_date"]}

    response =  photo_query(
        TableName = os.environ['db_name'],
        Select = "ALL_ATTRIBUTES",
        Limit = int(query_params.get("max_results", 25)),
        ConsistentRead = False,
        ScanIndexForward = False,
        KeyConditionExpression = "PK = :partitionkeyval" + range_condition,
        ExpressionAttributeValues = expression_attribute_values
    )
    print(response)
    print(item_to_dict(response["Items"]))

    items = item_to_dict(response["Items"])
    for item in items:
        id = item["GSI1SK"]
        print(id)
        id_arr = id.split('/', 1)
        print(id_arr)
        bucket = id_arr[0]
        print(bucket)
        key = id_arr[1]
        print(key)
        expiration = 3600
        item["signed_url"] = create_presigned_url(bucket, key, expiration)

        thumbnail_id = item["thumbnail_key"]
        thumbnail_id_arr = thumbnail_id.split('/', 1)
        thumbnail_bucket = thumbnail_id_arr[0]
        thumbnail_key = thumbnail_id_arr[1]
        thumbnail_expiration = 3600
        item["thumbnail_signed_url"] = create_presigned_url(thumbnail_bucket, thumbnail_key, thumbnail_expiration)

    print(items)
    return items

@app.route("/photo", methods=['PUT'])
def get_photos():
    return "photo saved."

@app.route("/spec")
def spec():
    swag = swagger(app)
    swag['info']['version'] = "0.1.0"
    swag['info']['title'] = "photo-svc API"
    return jsonify(swag)

if __name__ == "__main__":
  app.run()
