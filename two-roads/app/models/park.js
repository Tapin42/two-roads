import DS from 'ember-data';

export default DS.Model.extend({
  name: DS.attr(),
  dir: DS.attr(),
  start: DS.attr(),
  trailheads: DS.attr()
});
