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

    var isFunction = function (func) {
        return typeof func === 'function';
    };

    /**
     * 判断是否对象/JSON 是否为空
     * @param  {[type]}  obj [description]
     * @return {Boolean}     [description]
     */
    var isEmptyObject = function(obj){
        if(isFunction(obj)) {
            throw 'this is Function';
        }else{
            var bool = true;
            for(var i in obj) {
                bool = false;
                break;
            }
            return bool;
        }

    };

    /**
     * 构造回调函数
     */
    var Callback = function (fn, eventName) {
        this.name = eventName;
        this.callback = fn;
        this.emit = function(data) {
            this.callback(data);
        };
        return this;
    };

    /**
     * 构造集合类函数
     * @param {[type]} Obj [description]
     */
    var setCollection = function(Obj){
        var Collection = function(name){
            // DB.apply(this, arguments);
            DB.call(this, name);
            this.result = Obj.DB;
            delete this.database;
            delete this.version;
            delete this.initialCollections;
        };

        Collection.prototype = {
            constructor: Collection,

            getDatabase: function(){
                return this.result.database;
            },

            /**
             * IndexedDB查询符合条件的所有数据
             * @method find
             * @for DB.table
             * @param {Array} query 查询语句 eg: ['id', ['eq', 2]]
             * @param {Callback} resultData 回调返回数据
             * @return {Object} self/DB
             */
            find: function(query, resultData) {
                if(query === undefined || query === null) {
                    query = ['*'];
                }

                if(isFunction(query)) {
                    resultData = query;
                    query = ['*'];
                }
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readonly').objectStore(this.name);
                var i = 0;
                var data = [];
                var keyRangeValue = query[0] === '*' ? null : getKeyRangeValue(query[1]);
                var self = this;

                if(keyRangeValue === null) {
                    var request = objectStore.getAll();
                    request.onsuccess = function(e) {
                        success.emit({
                            error: 0,
                            message: 'find success',
                            data: {
                                result: e.target.result,
                                total: e.target.result.length
                            }
                        });
                    };
                    request.onerror = function(e) {
                        error.emit({
                            error: 1010,
                            message: 'find error',
                            data: e
                        });
                    };
                }else{
                    var result = function(e) {
                        var cursor = e.target.result;
                        if (cursor) {
                            i++;
                            data.push(cursor.value);
                            cursor.continue();
                        } else {
                            success.emit({
                                error: 0,
                                message: 'select success of total ' + i,
                                data: {
                                    result: data,
                                    total: i,
                                    query: query
                                }
                            });
                        }
                    };
                    objectStore.transaction.onerror = function(e) {
                        error.emit({
                            error: 1010,
                            message: 'find error',
                            data: e
                        });
                    };

                    if (query[0] === objectStore.keyPath) {
                        objectStore.openCursor(keyRangeValue, query[2] === undefined ? 'prev' : query[2]).onsuccess = function(e) {
                            result(e);
                        };
                    } else {
                        objectStore.index(query[0] + 'Index').openCursor(keyRangeValue, query[2] === undefined ? 'prev' : query[2]).onsuccess = function(e) {
                            result(e);
                        };
                    }
                }

                return this;
            },
            findOne: function (query, resultData) {
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readonly').objectStore(this.name);
                var self = this;
                objectStore.transaction.onerror = function(e) {
                    error.emit({
                        'error': -1,
                        'message': 'findOne operation fail!',
                        'data': e
                    });
                };

                var result = function (e) {
                    success.emit({
                        error: 0,
                        message: 'find success!',
                        data: {
                            result: e.target.result
                        }
                    });
                };

                if (query[0] === objectStore.keyPath) {
                    objectStore.get(query[1]).onsuccess = function(e) {
                        result(e);
                    };
                } else {
                    objectStore.index(query[0] + 'Index').get(query[1]).onsuccess = function(e) {
                        result(e);
                    };
                }

                return this;
            },
            insert: function (doc, resultData) {
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var self = this;
                var request = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name).add(doc);
                request.error = function (e) {
                    error.emit({
                        error: -1,
                        message: 'add fail!',
                        data: e
                    });
                };

                request.onsuccess = function (e) {
                    success.emit({
                        error: 0,
                        message: 'add success!',
                        index: e.target.result
                    });
                };
                return this;
            },
            batchInsert: function (arrayData, resultData) {
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var self = this;
                var count = 0;
                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);
                var total = (arrayData === null || arrayData === undefined) ? 0 : arrayData.length;
                if(total === 0){
                    error.emit({
                        error: -1,
                        message: 'no data!'
                    });
                }else{
                    var forFn = function () {
                        var request = objectStore.add(arrayData[i]);
                        request.onsuccess = function(e) {
                            success.emit({
                                error: 0,
                                message: 'insert success!',
                                data: {
                                    total: total,
                                    index: e.target.result
                                }
                            });
                        };
                        request.onerror = function(e) {
                            error.emit({
                                error: -1,
                                message: 'insert fail!',
                                data: e
                            });
                        };
                    };
                    for(var i=0; i<total; i++){
                        forFn();
                    }
                }
                return this;
            },
            /**
             * 数据更新-待增加
             * @param  {[type]} doc        [description]
             * @param  {[type]} resultData [description]
             * @return {[type]}            [description]
             */
            update: function(doc, resultData) {
                console.log('待增加！');
            },
            /**
             * 数据保存
             * @param  {[type]} doc        [description]
             * @param  {[type]} resultData [description]
             * @return {[type]}            [description]
             */
            save: function(doc, resultData) {
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                if(doc === undefined || isEmptyObject(doc)) {
                    throw 'no update data';
                }
                var self = this;
                var request = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name).put(doc);

                request.onerror = function (e){
                    error.emit({
                        error: -1,
                        message: 'save fail!',
                        data: e
                    });
                };

                request.onsuccess = function(e) {
                    success.emit({
                        error: 0,
                        message: 'save success!',
                        data: {
                            index: e.target.result
                        }
                    });
                };
                return this;
            },

            /**
             * indexedDB清空存储对象
             * @param  {Callback} resultData 回调返回数据
             * @return {Object} Collection
             */
            remove: function(query, resultData) {

                if(typeof query === 'function' || isEmptyObject(query)) {
                    resultData = query;
                    query = ['*'];
                }

                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);
                var self = this;
                if(query[0] === '*') {
                    var request = objectStore.clear();
                    request.onsuccess = function (e) {
                        success.emit({
                            error: 0,
                            message: "clear success!",
                            data: e
                        });
                    };
                    request.onerror = function (e) {
                        error.emit({
                            error: -1,
                            message: "clear fail!"
                        });
                    };
                }else{
                    var keyRangeValue = getKeyRangeValue(query[1]);
                    var i = 0;
                    var result = function(e) {
                        var cursor = e.target.result;
                        if (cursor) {
                            i++;
                            window.console.log(cursor);
                            cursor.delete();
                            cursor.continue();
                        } else {
                            success.emit({
                                error: 0,
                                message: 'delete success of total ' + i,
                                data: {
                                    total: i
                                }
                            });
                        }
                    };
                    if (query[0] === objectStore.keyPath) {
                        objectStore.openCursor(keyRangeValue).onsuccess = function(e) {
                            window.console.log(keyRangeValue);
                            result(e);
                        };
                    } else {
                        objectStore.index(query[0] + 'Index').openCursor(keyRangeValue).onsuccess = function(e) {
                            result(e);
                        };
                    }

                }

                return this;
            },
            /**
             * 获取全部 总数/记录数
             * @param  {[type]} resultData [description]
             * @return {[type]}            [description]
             */
            count: function (resultData){
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);

                var self = this;
                objectStore.transaction.onerror = function(e){
                    error.emit({
                        error: 0,
                        message: 'action fail!',
                        data: e
                    });
                };
                objectStore.count().onsuccess = function(e) {
                    success.emit({
                        error: 0,
                        message: "total " + e.target.result + ' !',
                        data: {
                            count: e.target.result
                        }
                    });
                    console.log(e.target.result);
                };
                return this;
            },
            /**
             * 获取全部主键值
             * @param  {Function} resultData 回调返回数据
             * @return {[type]}            [description]
             */
            keys: function(resultData) {
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);
                var request = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name).getAllKeys();
                request.onsuccess = function(e) {
                    success.emit({
                        error: 0,
                        message: "get success",
                        data: {
                            result: e.target.result
                        }
                    });
                };

                request.onerror = function(e) {
                    error.emit({
                        error: -1,
                        message: "get fail",
                        data: e
                    });
                };
            },
            /**
             * 刪除集合
             * @param  {[type]} resultData [description]
             * @return {[type]}            [description]
             */
            drop: function (resultData) {
                //注册事件
                var success = this.on("success", resultData);
                var error = this.on("error", resultData);

                var openDBRequest = this.result.updateVersion(this.getDatabase()); //更新版本
                console.log(openDBRequest);

                var self = this;
                openDBRequest.onupgradeneeded = function(e) {
                    self.result.database = e.target.result;
                    self.getDatabase().deleteObjectStore(self.name); //value is undefined
                    delete self.result[self.name];
                    success.emit({
                        error: 0,
                        message: self.name + ' removed and version update to ' + self.getDatabase().version + '!'
                    });
                };
                return this;
            }
        }; // Collection

        Obj.DB[Obj.collectionName] = new Collection(Obj.collectionName);
    };

    /**
     * 构造数据库类函数
     * @param {[type]} name               [description]
     * @param {[type]} initialCollections [description]
     */
    var DB = function(name, initialCollections){
        "use strict"; // 使用严格模式
        this.name = name;
        if(this.name === undefined){
            throw 'name is empty!';
        }
        this.initialCollections = initialCollections ? initialCollections : {};

        this.database = null;

        this.type = 'indexedDB';

        this.version = undefined;

        this.callfn = []; // 存储回调函数

        this.on = function (evtName, callback) {
            if(typeof callback === 'function') {
                // if(typeof evt === 'string') {
                //     evt = [evt];
                // }
                //
                // if(evt instanceof Array) {
                //     for(var i=0; i<evt.count; i++) {
                //         this['on' + evt] = callback;
                //     }
                // }
                return new Callback(callback, evtName);
            }
            return this;
        };

    };

    DB.prototype = {
        constructor: DB,
        /**
         * 打开 indexedDB， 获取数据库 database
         * @param  {[type]} resultData [description]
         * @return {[type]}            [description]
         */
        open: function(resultData) {
            var open = this.on('open', resultData);
            var success = this.on('success', resultData);
            var error = this.on('error', resultData);

            if (w.indexedDB === null) {
                throw "indexedDB don't support!";
            } else {
                var openDBRequest = w.indexedDB.open(this.name, this.version);
                var self = this;
                // window.console.log(openDBRequest);
                openDBRequest.onupgradeneeded = function(e){
                    for(var collectionName in self.initialCollections){
                        createCollection(e.target.result, collectionName, self.initialCollections[collectionName]);
                    }
                };
                openDBRequest.onsuccess = function(e) {
                    self.database = e.target.result;
                    self.version = self.database.version;

                    for(var collectionName in self.initialCollections){
                        setCollection({
                            DB: self,
                            collectionName: collectionName
                        });
                    }

                    open.emit({
                        error: 0,
                        message: 'open success!',
                        data: {
                            DB: self
                        }
                    });
                };

                openDBRequest.onerror = function(e) {
                    error.emit({
                        error: 0,
                        message: 'open database fail!',
                        result: e
                    });
                };
            }
            return this;
        },

        updateVersion: function(database) {
            database.close();
            this.version++;
            return w.indexedDB.open(this.name, this.version);
        },

        /**
         * 获取集合
         * @param  {[type]} collectionName [description]
         * @return {[type]}                [description]
         */
        getCollection: function (collectionName) {
            return this[collectionName];
        },

        /**
         * 删除数据库
         * @param  {[type]} dbName [description]
         * @return {[type]}        [description]
         */
        drop: function (dbName) {
            w.indexedDB.deleteDatabase(dbName || this.name);
            return this;
        }

    };

    w[idbName] = DB;
}(window, 'DB'));
