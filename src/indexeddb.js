(function(w, idbName){
    //indexedDB兼容处理
    w.indexedDB = w.indexedDB || w.webkitIndexedDB || w.mozIndexedDB || w.msIndexedDB;
    w.IDBTransaction = w.IDBTransaction || w.webkitIDBTransaction || w.msIDBTransaction;
    w.IDBKeyRange = w.IDBKeyRange || w.webkitIDBKeyRange || w.msIDBKeyRange;
    w.IDBCursor = w.IDBCursor || w.webkitIDBCursor || w.msIDBCursor;

    var createCollection = function (database, collection, tableField) {
        var index, request, data=[];
        for (index in tableField) {
            // window.console.log(table);
            switch (tableField[index][1]) {
                case 'primary':
                    request = database.createObjectStore(collection, {
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

        }
        //判断主键是否创建，若没有创建，则取id为默认主键，并自增
        if (request.name === undefined) {
            request = database.createObjectStore(collection, {
                keyPath: 'id',
                autoIncrement: true
            });
        }

        //创建存储对象索引
        for (index in data) {
            request.createIndex(data[index][0], data[index][1], data[index][2]);
        }
    };

    var getKeyRangeValue = function(condition) {
        var keyRangeValue;
        // condition[1] = parseInt(condition[1]) == condition[1] ? parseInt(condition[1]) : condition[1];
        switch (condition[0]) {
            case 'gt': // greater than
                keyRangeValue = w.IDBKeyRange.lowerBound(condition[1], condition[2] === undefined ? true : condition[2]);
                break;
            case 'lt': // less than
                keyRangeValue = w.IDBKeyRange.upperBound(condition[1], condition[2] === undefined ? true : condition[2]);
                break;
            case 'bt': // between
                keyRangeValue = w.IDBKeyRange.bound(condition[1][0], condition[1][1], condition[2] === undefined ? true : condition[2], condition[3] === undefined ? true : condition[3]);
                break;
            case 'eq': // equal
                keyRangeValue = w.IDBKeyRange.only(condition[1]);
                break;
            case 'lk': // like
                keyRangeValue = w.IDBKeyRange.includes(condition[1]);
                break;
            default:
                keyRangeValue = false;
                break;
        }
        return keyRangeValue;
    };

    var isEmptyObject = function(obj){
        var bool = true;
        for(var i in obj) {
            bool = false;
            break;
        }
        return bool;
    };

    var setCollection = function(Obj){
        var Collection = function(name){
            DB.apply(this, arguments);
            this.name = Obj.collectionName;
            this.database = Obj.database;
            this.result = Obj.DB;
            delete this.initialCollections;
        };

        Collection.prototype = {
            constructor: Collection,

            /**
             * IndexedDB查询符合条件的所有数据
             * @method find
             * @for DB.table
             * @param {Array} queryAll 查询语句 eg: ['id', ['eq', 2]]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            find: function(queryAll, resultData) {
                if(typeof queryAll === 'function') {
                    resultData = queryAll;
                    queryAll = ['*'];
                }

                var objectStore = this.database.transaction([this.name], 'readonly').objectStore(this.name),
                    i = 0,
                    data = [],
                    keyRangeValue = queryAll[0] === '*' ? null : getKeyRangeValue(queryAll[1]),
                    result = function(e, callback) {
                        var cursor = e.target.result;
                        if (cursor) {
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

                return this;
            },
            insert: function (doc, resultData) {
                var objectStore = this.database.transaction([this.name], 'readwrite').objectStore(this.name);
                objectStore.add(doc).onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: 'add success!',
                        index: e.target.result
                    });
                };
                return this;
            },
            batchInsert: function (arrayData, resultData) {
                var count = 0;
                var objectStore = this.database.transaction([this.name], 'readwrite').objectStore(this.name);
                var total = (arrayData === null || arrayData === undefined) ? 0 : arrayData.length;
                if(total === 0){
                    resultData({
                        error: 1,
                        message: 'no data!'
                    });
                }else{
                    /* jshint loopfunc:true */
                    for(var i=0; i<total; i++){
                        objectStore.add(arrayData[i]).onsuccess = function(e) {
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
                return this;
            },
            update: function(doc, resultData) {
                var objectStore = this.database.transaction([this.name], 'readwrite').objectStore(this.name);
                objectStore.put(doc).onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: 'save success!'
                    });
                };
                return this;
            },

            /**
             * indexedDB清空存储对象 - test ok
             * @param  {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            clear: function(resultData) {
                var objectStore = this.database.transaction([this.name], 'readwrite').objectStore(this.name);
                objectStore.clear().onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: "clear success!"
                    });
                };

                return self;
            }
        }; // Collection

        Obj.DB[Obj.collectionName] = new Collection(Obj.DB.name);
    };

    var DB = function(name, initialCollections){
        "use strict"; // 使用严格模式
        this.name = name;
        if(this.name === undefined){
            throw 'name is empty!';
        }
        this.initialCollections = initialCollections ? initialCollections : {};

        // this.useCollection = null;

        this.type = 'indexedDB';

        this.version = 0;

        this.onopen = null;

        this.onerror = null;

    };

    DB.prototype = {
        constructor: DB,

        open: function(resultData) {
            var self = this;
            if (w.indexedDB === null) {
                console.log("indexedDB don't support!");
                return self;
            } else {
                var openDBRequest = w.indexedDB.open(self.name);

                // window.console.log(openDBRequest);
                openDBRequest.onupgradeneeded = function(e){
                    for(var collectionName in self.initialCollections){
                        createCollection(e.target.result, collectionName, self.initialCollections[collectionName]);
                    }
                };
                openDBRequest.onsuccess = function(e) {
                    for(var collectionName in self.initialCollections){
                        setCollection({
                            DB: self,
                            collectionName: collectionName,
                            database: e.target.result
                        });
                    }

                    resultData({
                        error: 0,
                        message: 'open success!',
                        result: self
                    });
                };
            }
            return self;
        },

        getCollection: function (collectionName) {
            return this[collectionName];
        },

        remove: function (dbName) {
            w.indexedDB.deleteDatabase(dbName || this.name);
            return this;
        }

    };

    w[idbName] = DB;
}(window, 'DB'));
