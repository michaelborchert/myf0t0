from flask import Flask, jsonify, request, make_response
from flask_cors import CORS
from flask_swagger import swagger

import datetime
import json

app = Flask(__name__)
CORS(app)

@app.route("/")
def hello():
  return "Hello World!"

@app.route("/photos", methods=['GET'])
def get_photos():
    return "No photos."

@app.route("/spec")
def spec():
    swag = swagger(app)
    swag['info']['version'] = "0.1.0"
    swag['info']['title'] = "photo-svc API"
    return jsonify(swag)

if __name__ == "__main__":
  app.run()
