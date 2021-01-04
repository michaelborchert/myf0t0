# from flask import Flask, jsonify, request, make_response
# from flask_lambda import FlaskLambda
# from flask_cors import CORS
# from flask_swagger import swagger

from chalice import Chalice

import datetime
import json

#app = FlaskLambda(__name__)
#CORS(app)

app = Chalice(app_name='myf0t0-api')
app.api.cors = True

@app.route("/", methods=['GET'])
def hello():
  return {"hello": "world"}

@app.route("/photo", methods=['GET'])
def get_photos():
    return "No photos."

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
