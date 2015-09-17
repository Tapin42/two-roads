import DS from 'ember-data';

export default DS.JSONAPISerializer.extend({
  normalizeFindRecordResponse(store, typ, payload) {
    return {
      data: {
        id: 'root',
        type: typ.modelName,
        attributes: {
          parks: payload.parks
        // },
        // relationships: {
        //   park: {
        //     links: {
        //       related: payload.parks
        //     }
        //   }
        }
      }
    };
  }
});
