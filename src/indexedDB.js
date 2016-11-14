//indexedDB兼容处理
window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
window.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
window.IDBKeyRange = window.IDBKeyRange || window.webkitIDBKeyRange || window.msIDBKeyRange;
window.IDBCursor = window.IDBCursor || window.webkitIDBCursor || window.msIDBCursor;

/**
 * @name IndexedDb-WebSql
 * @author kian
 * @version 1.0.0
 * @param  {String} name    数据库名
 * @param  {Object} initialTable 初始化数据表
 * @return {Object}         self/DB
 */
var DB = function(name, initialTable) {
    "use strict";
    var self = this;
    var indexedDB = window.indexedDB;
    var onerror = function(e, callback) {
        window.console.log(e);
        var message = e.target.error.message;
        var errCode = -1; // default error code;
        if(message.match(/least one key|already exists/gi) !== null) {
            errCode = 6;
        }
        self.callback({
            error: errCode,
            message: e.target.error.message
        });
    };

    self.name = name;
    self.db = {};
    self.callback = function() {}; // 存储回调函数

    self.errCodeInfo = [
        '操作成功！', //0
        '', //1
        '', //2
        '', //3
        '', //4
        '', //5
        '记录已存在，无法重复操作！', //6
    ];

    function createTable(tableName, tableField){
        var index, request, data=[];
        for (index in tableField) {
            // window.console.log(table);
            switch (tableField[index][1]) {
                case 'primary':
                    request = self.db.createObjectStore(tableName, {
                        keyPath: tableField[index][0],
                        autoIncrement: tableField[index][2] === 'AI'
                    });
                break;
                case 'relation':
                    data.push([tableField[index][0] + 'Index', tableField[index][2], {
                        unique: false,
                        multiEntry: false
                    }]);
                break;
                default:
                    data.push([tableField[index][0] + 'Index', tableField[index][0], {
                        unique: tableField[index][1] === 'unique',
                        multiEntry: tableField[index][2] === 'ME'
                    }]);
                break;
            }
            //查找出主键，创建储对象
            // if (tableField[index][1] === 'primary') {
            //     request = self.db.createObjectStore(tableName, {
            //         keyPath: tableField[index][0],
            //         autoIncrement: tableField[index][2] === 'AI'
            //     });
            // } else {
            //     data.push([tableField[index][0] + 'Index', tableField[index][0], {
            //         unique: tableField[index][1] === 'unique',
            //         multiEntry: tableField[index][2] === 'ME'
            //     }]);
            // }
        }
        //判断主键是否创建，若没有创建，则取id为默认主键，并自增
        if (request.name === undefined) {
            request = self.db.createObjectStore(tableName, {
                keyPath: 'id',
                autoIncrement: true
            });
        }

        //创建存储对象索引
        for (index in data) {
            if (data.hasOwnProperty(index)) {
                request.createIndex(data[index][0], data[index][1], data[index][2]);
            }
        }
    }

    // indexedDB = undefined; // 测试模拟浏览器不支持indexedDB;
    this.open = function(resultData, v) {
        if (indexedDB !== undefined) {
            self.type = 'DB';
            self.name = name || self.type;
            if (self.db !== undefined && v !== undefined) {
                //更新版本，关闭数据库后，重新打开数据库，触发onupgradeneeded事件，达到创建/删除存储对象的效果
                self.db.close(); // value is undefined
                return indexedDB.open(self.name, v);
            } else {
                var openDBRequest = indexedDB.open(self.name);
                // window.console.log(openDBRequest);
                openDBRequest.onupgradeneeded = function(e){
                    self.db = e.target.result;
                    for(var tableName in initialTable){
                        createTable(tableName, initialTable[tableName]);
                    }
                };
                openDBRequest.onsuccess = function(e) {
                    self.db = e.target.result;
                    self.version = self.db.version;
                    resultData({
                        error: 0,
                        message: 'open success!',
                        DB: self
                    });
                };
                self.callback = resultData;
                openDBRequest.onerror = onerror;
                window.console.log(self.name + ' create success in indexedDB!');
            }
            return self;
        }
    };

    //数据表/存储对象操作
    this.table = function(tableName) {
        var table = this.table;
        var limitCount = -1;
        // tableName = tableName;
        if (self.type === 'DB') {
            /**
             * 获取存储对象查询区间
             * @param  {[array]} condition 查询条件
             * @return {[object]} keyRangeValue          [description]
             * @description field = [['name', 'index/unique/primary', 'autoIncrement/multiEntry'],['name', 'index/unique/primary', 'AU'],['name', 'index/unique/primary', 'ME']]
             */
            table.getKeyRangeValue = function(condition) {
                var keyRangeValue;
                // condition[1] = parseInt(condition[1]) == condition[1] ? parseInt(condition[1]) : condition[1];
                switch (condition[0]) {
                    case 'gt': // greater than
                        keyRangeValue = window.IDBKeyRange.lowerBound(condition[1], condition[2] === undefined ? true : condition[2]);
                        break;
                    case 'lt': // less than
                        keyRangeValue = window.IDBKeyRange.upperBound(condition[1], condition[2] === undefined ? true : condition[2]);
                        break;
                    case 'bt': // between
                        keyRangeValue = window.IDBKeyRange.bound(condition[1][0], condition[1][1], condition[2] === undefined ? true : condition[2], condition[3] === undefined ? true : condition[3]);
                        break;
                    case 'eq': // equal
                        keyRangeValue = window.IDBKeyRange.only(condition[1]);
                        break;
                    case 'lk': // like
                        keyRangeValue = window.IDBKeyRange.includes(condition[1]);
                        break;
                    default:
                        keyRangeValue = false;
                        break;
                }
                return keyRangeValue;
            };
            //
            //table.where = function (condition) {
            //    var objectStore = self.db.transaction([name], 'readwrite').objectStore(name);
            //    objectStore.transaction.onerror = onerror;
            //    where = (typeof condition === 'object') ? objectStore.openCursor(getKeyRangeValue(condition)) : objectStore;
            //    return table;
            //
            //}

            /**
             * 创建数剧表
             * @method create
             * @for DB.table
             * @param {Array} field eg: [['field', 'index/primary/uinique'], [AI/ME]]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self(DB)
             */
            table.create = function(field, resultData) {
                var request = {},
                    data = [],
                    openDBRequest = self.open(null, self.db.version + 1);
                // kian.log(self.db);
                openDBRequest.onupgradeneeded = function(e) {
                    self.db = e.target.result;
                    createTable(tableName, field);
                };
                openDBRequest.onerror = onerror;
                return self;
            };
            /**
             * IndexedDB删除数据表/存储对象
             * @method remove
             * @for DB.table
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.remove = function(resultData) {
                var openDBRequest = self.open(null, self.db.version + 1); //更新版本
                openDBRequest.onupgradeneeded = function(e) {
                    self.db = e.target.result;
                    self.db.deleteObjectStore(tableName); //value is undefined
                    resultData({
                        error: 0,
                        message: tableName + ' removed and version update to ' + self.db.version + '!'
                    });
                };
                self.callback = resultData;
                openDBRequest.onerror = onerror;

                return self;
            };
            table.limit = function(count){
                limitCount = count;
                return table;
            };
            /**
             * IndexedDB查询符合条件的所有数据
             * @method select
             * @for DB.table
             * @param {Array} queryAll 查询语句 eg: ['id', ['eq', 2]]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.select = function(queryAll, resultData) {
                var objectStore = self.db.transaction([tableName], 'readonly').objectStore(tableName),
                    i = 0,
                    data = [],
                    keyRangeValue = queryAll[0] === '*' ? null : table.getKeyRangeValue(queryAll[1]),
                    result = function(e, callback) {
                        var cursor = e.target.result;
                        if (cursor && limitCount !== i) {
                            i++;
                            data.push(cursor.value);
                            cursor.continue();
                        } else {
                            callback({
                                error: 0,
                                message: 'select success of total ' + i,
                                data: data,
                                total: i,
                                query: queryAll
                            });
                        }
                    };
                self.callback = resultData;
                objectStore.transaction.onerror = onerror;
                if (queryAll[0] === objectStore.keyPath || queryAll[0] === '*') {
                    objectStore.openCursor(keyRangeValue, queryAll[2] === undefined ? 'prev' : queryAll[2]).onsuccess = function(e) {
                        result(e, resultData);
                    };
                } else {
                    objectStore.index(queryAll[0] + 'Index').openCursor(keyRangeValue, queryAll[2] === undefined ? 'prev' : queryAll[2]).onsuccess = function(e) {
                        result(e, resultData);
                    };
                }

                return self;
            };
            /**
             * IndexedDB查询符合条件的第一条数据
             * @method find
             * @for DB.table
             * @param {Array} query 查询语句 eg: ['id', 2] as id = 2
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.find = function(query, resultData) {
                var objectStore = self.db.transaction([tableName], 'readonly').objectStore(tableName);
                self.callback = resultData;
                objectStore.transaction.onerror = onerror;
                if (query[0] === objectStore.keyPath) {
                    objectStore.get(query[1]).onsuccess = function(e) {
                        // window.console.log(e);
                        resultData({
                            error: 0,
                            message: 'find success!',
                            data: e.target.result
                        });
                    };
                } else {
                    objectStore.index(query[0] + 'Index').get(query[1]).onsuccess = function(e) {
                        // window.console.log(e);
                        resultData({
                            error: 0,
                            message: 'find success!',
                            data: e.target.result
                        });
                    };
                }

                return self;
            };
            /**
             * IndexedDB添加一条数据
             * @method add
             * @for DB.table
             * @param {Object} data {field1: data1, field2: data2, ...}
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.add = function(data, resultData) {
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
                //window.console.log(objectStore);
                self.callback = resultData;
                objectStore.transaction.onerror = onerror;
                //objectStore.transaction.oncomplete = function (e) {
                //    window.console.log('add success!');
                //};
                // console.log(data[0] || data);
                objectStore.add(data[0] || data).onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: 'add success!',
                        index: e.target.result
                    });
                };
                return self;
            };

            /**
             * IndexedDB批量添加数据
             * @method addAll
             * @for DB.table
             * @param {Object} arrayData [{},{},{},...]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.addAll = function(arrayData, resultData) {
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
                var total = arrayData.length;
                /* jshint loopfunc:true */
                for(var i=0; i<total; i++){
                    objectStore.add(arrayData[i]).onsuccess = function(e) {
                        resultData({
                            error: 0,
                            message: 'add success!',
                            data: {
                                total: total,
                                index: e.target.result
                            }
                        });
                    };
                }
                return self;
            };
            /**
             * IndexedDB更新/保存一条记录
             * @method save
             * @for DB.table
             * @param {Object} data {}
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.save = function(data, resultData) {
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
                objectStore.put(data).onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: 'save success!'
                    });
                };
                return self;
            };
            /**
             * IndexedDB 批量更新/保存列表记录
             * @method saveAll
             * @for DB.table
             * @param {Array} arrayData [{}, {}, {}...]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.saveAll = function(arrayData, resultData) {
                var count = 0;
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
                var total = (arrayData === null || arrayData === undefined) ? 0 : arrayData.length;
                if(total === 0){
                    resultData({
                        error: 1,
                        message: 'no data!'
                    });
                }else{
                    /* jshint loopfunc:true */
                    for(var i=0; i<total; i++){
                        objectStore.put(arrayData[i]).onsuccess = function(e) {
                            resultData({
                                error: 0,
                                message: 'save success!',
                                data: {
                                    total: total,
                                    index: e.target.result
                                }
                            });
                        };
                    }
                }
                return self;
            };
            /**
             * IndexedDB 删除记录
             * @method del
             * @for DB.table
             * @param {Array} arrayData eg: ['id', ['eq', 1]]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            // table.del = function(query, resultData) {
            //     var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
            //     objectStore.transaction.onerror = onerror;
            //     if (query[0] === objectStore.keyPath) {
            //         objectStore.delete(query[1]).onsuccess = function(e) {
            //             // window.console.log(e);
            //             resultData({
            //                 error: 0,
            //                 message: 'del success!'
            //             });
            //         };
            //     } else {
            //         objectStore.index(query[0] + 'Index').delete(query[1]).onsuccess = function(e) {
            //             // window.console.log(e);
            //             resultData({
            //                 error: 0,
            //                 message: 'del success!'
            //             });
            //         };
            //     }
            //     return self;
            // };
            /**
             * 删除数据
             * @param  {Array} query   [description]
             * @param  {Callback} resultData [description]
             * @return {Object}            [description]
             */
            table.del = function(query, resultData) {
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName),
                    i = 0,
                    keyRangeValue = table.getKeyRangeValue(query[1]),
                    result = function(e, callback) {
                        var cursor = e.target.result;
                        window.console.log(cursor);
                        if (cursor) {
                            i++;
                            window.console.log(cursor);
                            cursor.delete();
                            cursor.continue();
                        } else {
                            callback({
                                error: 0,
                                message: 'delAll success of total ' + i,
                                total: i
                            });
                        }
                    };
                self.callback = resultData;
                objectStore.transaction.onerror = onerror;
                if (query[0] === objectStore.keyPath) {
                    objectStore.openCursor(keyRangeValue).onsuccess = function(e) {
                        window.console.log(keyRangeValue);
                        result(e, resultData);
                    };
                } else {
                    objectStore.index(query[0] + 'Index').openCursor(keyRangeValue).onsuccess = function(e) {
                        result(e, resultData);
                    };
                }

                return self;
            };
            table.total = function(resultData) {
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
                self.callback = resultData;
                objectStore.transaction.onerror = onerror;
                objectStore.count().onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: "total " + e.target.result + ' !',
                        data: e.target.result
                    });
                };
            };
            /**
             * indexedDB清空存储对象 - test ok
             * @param  {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            table.clear = function(resultData) {
                var objectStore = self.db.transaction([tableName], 'readwrite').objectStore(tableName);
                self.callback = resultData;
                objectStore.transaction.onerror = onerror;
                objectStore.clear().onsuccess = function(e) {
                    window.console.log(e);
                    resultData({
                        error: 0,
                        message: "clear success!"
                    });
                };

                return self;
            };

            //无操作返回数据表对象
            return table;
        }

        return self;
    };

    /**
     * 删除数据库
     * [function description]
     * @param  {[type]} dbName [description]
     * @return {[type]}        [description]
     */
    this.remove = function(dbName) {
        indexedDB.deleteDatabase(dbName || self.name);
        return self;
    };
};
