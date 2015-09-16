import DS from 'ember-data';

export default DS.JSONAPISerializer.extend({
  normalizeFindRecordResponse(store, typ, payload) {
    return {
      data: {
        id: payload.dir,
        type: typ.modelName,
        attributes: {
          name: payload.name,
          dir: payload.dir,
          start: payload.start,
          trailheads: payload.trailheads
        }
      }
    }
  }
});
