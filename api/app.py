# from flask import Flask, jsonify, request, make_response
# from flask_lambda import FlaskLambda
# from flask_cors import CORS
# from flask_swagger import swagger

from chalice import Chalice

import boto3

import datetime
import base64
import json
import os

#app = FlaskLambda(__name__)
#CORS(app)

app = Chalice(app_name='myf0t0-api')
app.api.cors = True

db_client = boto3.client('dynamodb')

def photo_query(**kwargs):
    if (":partitionkeyval" in kwargs["ExpressionAttributeValues"].keys()):
        print("debug1")
        if (kwargs["ExpressionAttributeValues"][":partitionkeyval"].get("S", "Not Found") == "$photos"):
            print("debug2")
            output = {"Items": []}
            for x in range(1,5):
                print("debug3")
                kwargs["ExpressionAttributeValues"][":partitionkeyval"]["S"] = "photos"+str(x)
                response = db_client.query(**kwargs)
                #print(response)
                output["Items"].extend(response["Items"])
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

@app.route("/photo", methods=['GET'])
def get_photos():
    print(json.dumps(app.current_request.to_dict(), indent=2))
    response =  photo_query(
        TableName = os.environ['db_name'],
        Select = "ALL_ATTRIBUTES",
        Limit = 25,
        ConsistentRead = False,
        ScanIndexForward = False,
        KeyConditionExpression = "PK = :partitionkeyval",
        ExpressionAttributeValues = {":partitionkeyval":{"S": "$photos"}}
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
