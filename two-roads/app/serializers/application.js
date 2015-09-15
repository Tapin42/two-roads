import DS from 'ember-data';

export default DS.RESTSerializer.extend({
  normalizeFindRecordResponse(store, type, payload) {
    return {
      data: {
        id: payload.name,
        type: type.modelName,
        attributes: {
          name: payload.name,
          dir: payload.dir
        }
      }
    }
  }
});
