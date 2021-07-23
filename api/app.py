from chalice import Chalice, CORSConfig, Response

import boto3
from boto3.dynamodb.conditions import Key

import datetime
import hashlib
import random
import string
import base64
import json
import os

app = Chalice(app_name='myf0t0-api')
#app.api.cors = True
cors_config = CORSConfig(
    allow_origin='*',
    allow_credentials=True)

unauthenticated_cors_config = CORSConfig(
    allow_origin='*')

db_client = boto3.client('dynamodb')
db = boto3.resource('dynamodb')
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
        filename_parts = kwargs["Key"]["SK"]["S"].split("_")[1:]
        filename = "_".join(filename_parts);
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
                    elif type == "SS":
                        output[k] = []
                        for sub_item in v[type]:
                            output[k].append(sub_item);
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
    return get_photos_from_filters(query_params, query_params.get("max_results", 50), query_params.get("LastPhotoKey", None))

def get_photos_from_filters(filters, max_items, last_key=None):
    filter_expression = "PK BETWEEN :photostart AND :photoend"
    expression_attribute_values = {":photostart": {"S": "photos0"}, ":photoend": {"S": "photos5"}}
    if "start_date" in filters.keys() and "end_date" in filters.keys():
        filter_expression = filter_expression + " AND SK BETWEEN :startdate AND :enddate"
        expression_attribute_values[":startdate"] = {"S": filters["start_date"]}
        expression_attribute_values[":enddate"] = {"S": filters["end_date"]}
    elif "start_date" in filters.keys():
        filter_expression = filter_expression + " AND SK > :startdate"
        expression_attribute_values[":startdate"] = {"S": filters["start_date"]}
    elif "end_date" in filters.keys():
        filter_expression = filter_expression + " AND SK <= :enddate"
        expression_attribute_values[":enddate"] = {"S": filters["end_date"]}

    if "rating" in filters.keys():
        rating = filters["rating"]
        if rating != "all":
            #If the filter is "all" that's the same as wide open - don't add any constraints.

            if rating == "unrated":
                filter_expression = filter_expression + " AND GSI1PK = :rating"
                expression_attribute_values[":rating"] = {"S": "0"}
            else:
                filter_expression = filter_expression + " AND GSI1PK >= :rating"
                expression_attribute_values[":rating"] = {"S": rating}

    if "tags" in filters.keys():
        tag_list = filters["tags"].split(",")
        print(tag_list)
        for i in range(0, len(tag_list)):
            tag_index_name = ":tag"+str(i)
            filter_expression = filter_expression + " AND contains (tags, " + tag_index_name + ")"
            expression_attribute_values[tag_index_name] = {"S": tag_list[i]}

    print(filter_expression)

    scan_kwargs = {
        'TableName': os.environ['db_name'],
        'ConsistentRead': False,
        'ProjectionExpression': "PK, SK, GSI1PK, GSI1SK, exif, thumbnail_key, rating, tags",
    }

    if filter_expression:
        scan_kwargs['FilterExpression'] = filter_expression

    if expression_attribute_values:
        scan_kwargs['ExpressionAttributeValues'] = expression_attribute_values

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
    if last_key:
        print(last_key)
        index=0;
        while index < len(output["Items"]):
            if output["Items"][index]["SK"]["S"] == last_key:
                break
            index = index + 1
        count = index+1
        del output["Items"][:count]

    #Limit by max_results param
    if max_items:
        if int(max_items) < len(output["Items"]):
            output["Items"] = output["Items"][:int(max_items)]
            print(output["Items"][-1]["SK"]["S"])
            #If any results weren't sent, calculate and add new LEK to results.
            output["LastPhotoKey"] = output["Items"][-1]["SK"]["S"]
    print("DEBUG!");
    items = item_to_dict(output["Items"])
    print("DEBUG!");

    response = {"Items": items}

    if 'LastPhotoKey' in output:
        response["LastPhotoKey"] =  output["LastPhotoKey"]
    return response

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
    #body = app.current_request.json_body
    params = app.current_request.query_params
    if "photo_id" not in params or "tag" not in params:
        return Response(body='Malformed body', status_code=400)

    args = {
        'TableName': os.environ['db_name'],
        'Key': {"PK": {"S": "$photos"}, "SK": {"S": params["photo_id"]}},
        'UpdateExpression': "ADD tags :tag",
        'ExpressionAttributeValues': {
            ":tag": {"SS": [str(params["tag"])]},
        },
        'ReturnValues': "ALL_NEW"
    }

    response = photo_update(**args)

    updated_pk = response["Attributes"]["PK"]
    updated_sk = response["Attributes"]["SK"]

    print(response)

    if response:
        args = {
            'TableName': os.environ['db_name'],
            'Item': {
                "PK" : {"S": "tag:"+str(params["tag"])},
                "SK" : {"S": params["photo_id"]},
                "GSI1SK": response["Attributes"]["GSI1SK"],
                "thumbnail_key": response["Attributes"]["thumbnail_key"]
            }
        }

        tag_insert_response = db_client.put_item(**args)

        print(tag_insert_response)

    return  {"message": "tag saved."}

@app.route("/tag", methods=['DELETE'], cors=cors_config)
def delete_tag():
    params = app.current_request.query_params
    if "photo_id" not in params or "tag" not in params:
        return Response(body='Malformed body', status_code=400)
    args = {
        'TableName': os.environ['db_name'],
        'Key': {"PK": {"S": "$photos"}, "SK": {"S": params["photo_id"]}},
        'UpdateExpression': "delete tags :tag",
        'ExpressionAttributeValues': {
            ":tag": {"SS": [str(params["tag"])]},
        },
        'ReturnValues': "ALL_NEW"
    }

    response = photo_update(**args)

    if response:
        args = {
            'TableName': os.environ['db_name'],
            'Key': {
                "PK" : {"S": "tag:"+str(params["tag"])},
                "SK" : {"S": params["photo_id"]},
            }
        }

        tag_delete_response = db_client.delete_item(**args)

        print(tag_delete_response)
    return  {"message": "tag removed."}

@app.route("/gallery", methods=['PUT'], cors=cors_config)
def put_gallery():
    params = app.current_request.query_params
    if "filters" not in params or "name" not in params:
        return Response(body='Malformed body',
                        status_code=400)

    #generate unique URL
    characters = string.ascii_lowercase + string.digits
    gallery_id = ''.join(random.choice(characters) for i in range(24))
    timestamp = datetime.datetime.now()

    table = db.Table(os.environ['db_name'])
    response  = table.put_item(
        Item= {
            'PK': "gallery",
            'SK': params["name"],
            'GSI1PK': "gallery",
            'GSI1SK': gallery_id,
            'filters': params["filters"],
            'timestamp': str(timestamp)
        }
    )

    return {'message': 'gallery saved', 'gallery_id': gallery_id}

@app.route("/gallery", methods=['DELETE'], cors=cors_config)
def delete_gallery():
    params = app.current_request.query_params
    if "name" not in params:
        return Response(body='Malformed body',
                        status_code=400)

    table = db.Table(os.environ['db_name'])
    try:
        response = table.delete_item(
            Key={
                'PK': "gallery",
                'SK': params["name"]
            }
        )
    except ClientError as e:
        print(e.response['Error']['Message'])
    else:
        return {'message': 'gallery deleted'}

@app.route("/gallery/{gallery_id}", methods=['GET'], cors=unauthenticated_cors_config)
def get_gallery(gallery_id):
    table = db.Table(os.environ['db_name'])
    response = table.query(
        IndexName="GSI1",
        KeyConditionExpression=Key('GSI1PK').eq("gallery") & Key('GSI1SK').eq(gallery_id)
    )
    print(response)

    if "filters" in response["Items"][0].keys():
        filters = json.loads(response["Items"][0]["filters"])
        name = response["Items"][0]["SK"]
        print(filters)
        response = get_photos_from_filters(filters, 200)
        print(response)
        #Gotsta sign the URL's server-side so they're accessible for unauthenticated users!
        for photo in response["Items"]:
            id = photo["GSI1SK"]
            #print(id)
            id_arr = id.split('/', 1)
            #print(id_arr)
            bucket = id_arr[0]
            #print(bucket)
            key = id_arr[1]
            #print(key)
            expiration = 3600
            photo["signed_url"] = create_presigned_url(bucket, key, expiration)

            thumbnail_id = photo["thumbnail_key"]
            thumbnail_id_arr = thumbnail_id.split('/', 1)
            thumbnail_bucket = thumbnail_id_arr[0]
            thumbnail_key = thumbnail_id_arr[1]
            photo["signed_thumbnail_url"] = create_presigned_url(thumbnail_bucket, thumbnail_key, expiration)
        response["GalleryName"] = name
        return(response)
    else:
        return {'message': 'Something went wrong - no filters found.'}

@app.route("/gallerylist", methods=['GET'], cors=cors_config)
def get_gallerylist():
    table = db.Table(os.environ['db_name'])
    response = table.query(
        KeyConditionExpression=Key('PK').eq("gallery")
    )
    return response

@app.route("/spec")
def spec():
    swag = swagger(app)
    swag['info']['version'] = "0.1.0"
    swag['info']['title'] = "photo-svc API"
    return jsonify(swag)

if __name__ == "__main__":
  app.run()
