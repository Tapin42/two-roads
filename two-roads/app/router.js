import Ember from 'ember';
import config from './config/environment';

var Router = Ember.Router.extend({
  location: config.locationType
});

Router.map(function() {
  this.route('plan', { path: '/plan/:park' });
  this.route('overview');
  this.route('park');
});

export default Router;
