import React from 'react';
import ReactDOM from 'react-dom';

import App from './App.js'

import Amplify, { Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_oQdtzjMQ1',
    userPoolWebClientId: '55i8vm5ina7g9v1j86cpmp6gjv',
    mandatorySignIn: true,
    oauth: {
              domain: 'myf0t0-teststack2',
              scope: ['phone', 'email', 'profile', 'openid', 'aws.cognito.signin.user.admin'],
              redirectSignIn: 'http://localhost:3000/',
              redirectSignOut: 'http://localhost:3000/',
              responseType: 'code' // or 'token', note that REFRESH token will only be generated when the responseType is code
          }
    }
  }
);

ReactDOM.render(
  <App />,
  document.getElementById('root')
);
