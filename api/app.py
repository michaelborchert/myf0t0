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
    allow_origin='*')

db_client = boto3.client('dynamodb')

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

    return item_to_dict(response["Items"])

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
