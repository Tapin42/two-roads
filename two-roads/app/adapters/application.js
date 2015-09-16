import DS from 'ember-data';

export default DS.RESTAdapter.extend({
  host: 'http://localhost:8000',
  pathForType: function (typ) {
    if (typ === 'park') {
      return '/';
    }
    return typ;
  }
});
