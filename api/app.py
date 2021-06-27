from chalice import Chalice, CORSConfig, Response

import boto3

import datetime
import hashlib
import base64
import json
import os

app = Chalice(app_name='myf0t0-api')
app.api.cors = True
cors_config = CORSConfig(
    allow_origin='*',
    allow_credentials=True)

db_client = boto3.client('dynamodb')
s3_client = boto3.client('s3')

def get_index_hash(filename):
    return int(hashlib.md5(filename.encode()).hexdigest(), 16)%4

def photo_query(**kwargs):
    if (":partitionkeyval" in kwargs["ExpressionAttributeValues"].keys()):
        if (kwargs["ExpressionAttributeValues"][":partitionkeyval"].get("S", "Not Found") == "$photos"):
            output = {"Items": []}
            exclusiveStartRangeKey = ""
            if "ExclusiveStartKey" in kwargs:
                exclusiveStartRangeKey = kwargs["ExclusiveStartKey"]
            for x in range(0,4):
                kwargs["ExpressionAttributeValues"][":partitionkeyval"]["S"] = "photos"+str(x)
                if exclusiveStartRangeKey:
                    kwargs["ExclusiveStartKey"] = {"PK": {"S": "photos"+str(x)}, "SK": {"S": exclusiveStartRangeKey}}
                response = db_client.query(**kwargs)
                output["Items"].extend(response["Items"])

            output["Items"] = sorted(output["Items"], key=lambda i: i["SK"]["S"], reverse=True)

            print("Responses: {}".format(len(output["Items"])))

            if "Limit" in kwargs.keys():
                #Check for LEK - we may be using a filter expression that results in zero items but more to fetch
                if int(kwargs["Limit"]) < len(output["Items"]):
                    output["Items"] = output["Items"][:int(kwargs["Limit"])]
                    output["LastEvaluatedKey"] = output["Items"][-1]["SK"]["S"]

            return output
    else:
        response =  db_client.query(**kwargs)
        return response

def photo_update(**kwargs):
    if ("PK" in kwargs["Key"]):
        filename = kwargs["Key"]["SK"]["S"].split("_")[1]
        primary_key = "photos{}".format(get_index_hash(filename))
        kwargs["Key"]["PK"]["S"] = primary_key

    response = db_client.update_item(**kwargs)

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
                        #b_string = v[type]
                        #output[k] = b_string.decode('UTF-16')
                        #I cannot figure out how to turn EXIF byte strings into anything intelligible!
                        pass
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
    query_params = app.current_request.to_dict()["query_params"]
    print(app.current_request.to_dict())
    if not query_params:
        query_params = {}

    filter_expression = ""
    expression_attribute_values = {}
    if "start_date" in query_params.keys() and "end_date" in query_params.keys():
        filter_expression = "SK BETWEEN :startdate AND :enddate"
        expression_attribute_values[":startdate"] = {"S": query_params["start_date"]}
        expression_attribute_values[":enddate"] = {"S": query_params["end_date"]}
    elif "start_date" in query_params.keys():
        filter_expression = "SK > :startdate"
        expression_attribute_values[":startdate"] = {"S": query_params["start_date"]}
    elif "end_date" in query_params.keys():
        filter_expression = "SK <= :enddate"
        expression_attribute_values[":enddate"] = {"S": query_params["end_date"]}

    if "min_rating" in query_params.keys():
        if filter_expression:
            filter_expression = filter_expression + " AND "
        filter_expression = filter_expression + "GSI1PK >= :rating"
        expression_attribute_values[":rating"] = {"S": str(query_params["min_rating"])}


    scan_kwargs = {
        'TableName': os.environ['db_name'],
        'FilterExpression': filter_expression,
        'ConsistentRead': False,
        'ProjectionExpression': "PK, SK, GSI1PK, GSI1SK, exif, thumbnail_key, rating",
        'ExpressionAttributeValues': expression_attribute_values,
    }



        #scan_kwargs["ExclusiveStartKey"] = json.loads(query_params["lek"])

    #Get all the photos.  This is ineffecient, but may not matter for our scale.
    done = False
    start_key = None
    output = {"Items": []}
    while not done:
        if start_key:
            scan_kwargs['ExclusiveStartKey'] = start_key
        response = db_client.scan(**scan_kwargs)
        output["Items"].extend(response.get('Items', []))
        start_key = response.get('LastEvaluatedKey', None)
        done = start_key is None

    #Order by date, newer photos first.
    output["Items"] = sorted(output["Items"], key=lambda i: i["SK"]["S"], reverse=True)

    #Cut off the beginning based on the LastPhotoKey, if there is one.
    if "LastPhotoKey" in query_params.keys():
        print(query_params["LastPhotoKey"])
        index=0;
        while index < len(output["Items"]):
            if output["Items"][index]["SK"]["S"] == query_params["LastPhotoKey"]:
                break
            index = index + 1
        count = index+1
        del output["Items"][:count]

    #Limit by max_results param
    if "max_results" in query_params.keys():
        if int(query_params["max_results"]) < len(output["Items"]):
            output["Items"] = output["Items"][:int(query_params["max_results"])]
            print(output["Items"][-1]["SK"]["S"])
            #If any results weren't sent, calculate and add new LEK to results.
            output["LastPhotoKey"] = output["Items"][-1]["SK"]["S"]
    print("DEBUG!");
    items = item_to_dict(output["Items"])
    print("DEBUG!");

    webResponse = {"Items": items}

    if 'LastPhotoKey' in output:
        webResponse["LastPhotoKey"] =  output["LastPhotoKey"]
    return webResponse

def get_photos_old():
    #print(json.dumps(app.current_request.to_dict(), indent=2))

    expression_attribute_values = {":partitionkeyval":{"S": "$photos"}}

    query_params = app.current_request.to_dict()["query_params"]
    print(app.current_request.to_dict())
    print(query_params);
    if not query_params:
        query_params = {}

    range_condition = ""
    filter_expression = ""
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

    if "min_rating" in query_params.keys():
        filter_expression = filter_expression + " AND GSI1PK >= :rating"
        expression_attribute_values[":rating"] = {"S": str(query_params["min_rating"])}

    print(filter_expression[5:])
    print(range_condition)
    args = {
        'TableName': os.environ['db_name'],
        'Select': "ALL_ATTRIBUTES",
        'Limit': int(query_params.get("max_results", 50)),
        'ConsistentRead': False,
        'ScanIndexForward': False,
        'KeyConditionExpression': "PK = :partitionkeyval" + range_condition,
        'ExpressionAttributeValues': expression_attribute_values
    }

    if len(filter_expression) > 5:
        args['FilterExpression'] = filter_expression[5:]


    if "lek" in query_params.keys():
        args["ExclusiveStartKey"] = query_params["lek"]

    response =  photo_query(**args)

    items = item_to_dict(response["Items"])
    for item in items:
        id = item["GSI1SK"]
        #print(id)
        id_arr = id.split('/', 1)
        #print(id_arr)
        bucket = id_arr[0]
        #print(bucket)
        key = id_arr[1]
        #print(key)
        expiration = 3600
        #item["signed_url"] = create_presigned_url(bucket, key, expiration)

        thumbnail_id = item["thumbnail_key"]
        thumbnail_id_arr = thumbnail_id.split('/', 1)
        thumbnail_bucket = thumbnail_id_arr[0]
        thumbnail_key = thumbnail_id_arr[1]
        thumbnail_expiration = 3600
        #item["thumbnail_signed_url"] = create_presigned_url(thumbnail_bucket, thumbnail_key, thumbnail_expiration)

    webResponse = {"Items": items}

    if 'LastEvaluatedKey' in response:
        webResponse["LastEvaluatedKey"] = response['LastEvaluatedKey']

    return webResponse

# @app.route("/photo", methods=['PUT'])
# def put_photo():
#     return "photo saved."

@app.route("/rating", methods=['PUT'], cors=cors_config)
def put_rating():
    print(app.current_request.to_dict())
    params = app.current_request.query_params
    print(params)
    if "photo_id" not in params or "rating" not in params:
        return Response(body='Malformed body',
                        status_code=400)

    args = {
        'TableName': os.environ['db_name'],
        'Key': {"PK": {"S": "$photos"}, "SK": {"S": params["photo_id"]}},
        'UpdateExpression': "SET GSI1PK=:rating",
        'ExpressionAttributeValues': {":rating": {"S": str(params["rating"])}},
    }

    response = photo_update(**args)

    return {"message": "rating saved."}

@app.route("/tag", methods=['PUT'], cors=cors_config)
def put_tag():
    body = app.current_request.json_body
    if "photo_id" not in body or "tag" not in body:
        return Response(body='Malformed body', status_code=400)
    args = {
        'TableName': os.environ['db_name'],
        'Key': {"PK": {"S": "$photos"}, "SK": {"S": body["photo_id"]}},
        'UpdateExpression': "ADD tags :tag",
        'ExpressionAttributeValues': {
            ":tag": {"SS": [str(body["tag"])]},
        }
    }

    response = photo_update(**args)

    return  {"message": "tag saved."}

@app.route("/tag", methods=['DELETE'], cors=cors_config)
def delete_tag():
    body = app.current_request.json_body
    if "photo_id" not in body or "tag" not in body:
        return Response(body='Malformed body', status_code=400)
    args = {
        'TableName': os.environ['db_name'],
        'Key': {"PK": {"S": "$photos"}, "SK": {"S": body["photo_id"]}},
        'UpdateExpression': "delete tags :tag",
        'ExpressionAttributeValues': {
            ":tag": {"SS": [str(body["tag"])]},
        }
    }

    response = photo_update(**args)

    return  {"message": "tag removed."}

@app.route("/spec")
def spec():
    swag = swagger(app)
    swag['info']['version'] = "0.1.0"
    swag['info']['title'] = "photo-svc API"
    return jsonify(swag)

if __name__ == "__main__":
  app.run()
