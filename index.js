var mongoose = require("mongoose");
module.exports = function(
  schema,
  deepGetOne,
  deepSearch,
  defaultSort,
  defaultSortOrder
) {
  var data = {
    import: function(data, callback) {
      var Model = this;
      var retVal = [];
      async.eachSeries(
        data,
        function(n, callback) {
          Model(n).save(n, function(err, data) {
            if (err) {
              err.val = data;
              retVal.push(err);
            } else {
              retVal.push(data._id);
            }
            callback();
          });
        },
        function(err) {
          if (err) {
            callback(err, data);
          } else {
            callback(err, {
              total: retVal.length,
              value: retVal
            });
          }
        }
      );
    },
    generateExcel: function(name, res) {
      var Model = this;
      Model.find().exec(function(err, data) {
        var data3 = _.map(data, function(data2) {
          return modifyForExcel(data2);
        });

        function schamaObjectValConversion(newObj, schExcel, obj, key, value) {
          var name = key;
          if (schExcel.name) {
            name = schExcel.name;
          }
          if (schExcel.modify) {
            newObj[name] = schExcel.modify(value, obj);
          } else {
            newObj[name] = value;
          }
        }

        function modifyForExcel(obj) {
          var newObj = {};

          _.each(schema.obj, function(sch, key) {
            var value = obj[key];
            switch (typeof sch.excel) {
              case "boolean":
                {
                  newObj[key] = value;
                }
                break;
              case "string":
                {
                  newObj[sch.excel] = value;
                }
                break;
              case "object":
                {
                  if (_.isArray(sch.excel)) {
                    _.each(sch.excel, function(singleExcel) {
                      schamaObjectValConversion(
                        newObj,
                        singleExcel,
                        obj,
                        key,
                        value
                      );
                    });
                  } else {
                    schamaObjectValConversion(
                      newObj,
                      sch.excel,
                      obj,
                      key,
                      value
                    );
                  }
                }
                break;
            }
          });
          return newObj;
        }

        Config.generateExcel(name, data3, res);
      });
    },
    getIdByName: function(data, callback) {
      var Model = this;
      var Const = this(data);
      Model.findOne(
        {
          name: data.name
        },
        function(err, data2) {
          if (err) {
            callback(err);
          } else if (_.isEmpty(data2)) {
            Const.save(function(err, data3) {
              if (err) {
                callback(err);
              } else {
                callback(null, data3._id);
              }
            });
          } else {
            callback(null, data2._id);
          }
        }
      );
    },
    saveData: function(data, callback) {
      var Model = this;
      var Const = this(data);
      var foreignKeys = Config.getForeignKeys(schema);
      if (data._id) {
        Model.findOne(
          {
            _id: data._id
          },
          function(err, data2) {
            if (err) {
              callback(err, data2);
            } else if (data2) {
              async.each(
                foreignKeys,
                function(n, callback) {
                  if (data[n.name] != data2[n.name]) {
                    Config.manageArrayObject(
                      mongoose.models[n.ref],
                      data2[n.name],
                      data2._id,
                      n.key,
                      "delete",
                      function(err, md) {
                        if (err) {
                          callback(err, md);
                        } else {
                          Config.manageArrayObject(
                            mongoose.models[n.ref],
                            data[n.name],
                            data2._id,
                            n.key,
                            "create",
                            callback
                          );
                        }
                      }
                    );
                  } else {
                    callback(null, "no found for ");
                  }
                },
                function(err) {
                  data2.update(
                    data,
                    {
                      w: 1
                    },
                    callback
                  );
                }
              );
            } else {
              callback("No Data Found", data2);
            }
          }
        );
      } else {
        Const.save(function(err, data2) {
          if (err) {
            callback(err, data2);
          } else {
            async.each(
              foreignKeys,
              function(n, callback) {
                Config.manageArrayObject(
                  mongoose.models[n.ref],
                  data2[n.name],
                  data2._id,
                  n.key,
                  "create",
                  function(err, md) {
                    callback(err, data2);
                  }
                );
              },
              function(err) {
                callback(err, data2);
              }
            );
          }
        });
      }
    },
    deleteData: function(data, callback) {
      var Model = this;
      var Const = this(data);
      var foreignKeys = Config.getForeignKeys(schema);
      Config.checkRestrictedDelete(
        Model,
        schema,
        {
          _id: data._id
        },
        function(err, value) {
          if (err) {
            callback(err, null);
          } else if (value) {
            Model.findOne({
              _id: data._id
            }).exec(function(err, data2) {
              if (err) {
                callback("Error Occured", null);
              } else if (data2) {
                async.each(
                  foreignKeys,
                  function(n, callback) {
                    Config.manageArrayObject(
                      mongoose.models[n.ref],
                      data2[n.name],
                      data2._id,
                      n.key,
                      "delete",
                      function(err, md) {
                        callback(err, data2);
                      }
                    );
                  },
                  function(err) {
                    if (err) {
                      callback(err, md);
                    } else {
                      data2.remove({}, function(err, data3) {
                        if (err) {
                          callback(err, data3);
                        } else {
                          callback(err, data3);
                        }
                      });
                    }
                  }
                );
              }
            });
          } else if (!value) {
            callback(
              "Can not delete the Object as Restricted Deleted Points are available.",
              null
            );
          }
        }
      );
    },
    getOne: function(data, callback) {
      var Model = this;
      var Const = this(data);
      Model.findOne({
        _id: data._id
      }).exec(callback);
    },
    search: function(data, callback) {
      var Model = this;
      var Const = this(data);
      var maxRow = Config.maxRow;

      var page = 1;
      if (data.page) {
        page = data.page;
      }
      var field = data.field;

      var options = {
        field: data.field,
        filters: {
          keyword: {
            fields: ["name"],
            term: data.keyword
          }
        },
        sort: {
          asc: "name"
        },
        start: (page - 1) * maxRow,
        count: maxRow
      };

      if (defaultSort) {
        if (defaultSortOrder && defaultSortOrder === "desc") {
          options.sort = {
            desc: defaultSort
          };
        } else {
          options.sort = {
            asc: defaultSort
          };
        }
      }

      var Search = Model.find(data.filter)

        .order(options)
        .keyword(options)
        .page(options, callback);
    }
  };
  return data;
};
