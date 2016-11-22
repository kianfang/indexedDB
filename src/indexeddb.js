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
                if(query === undefined) {
                    query = ['*'];
                }

                if(isFunction(query)) {
                    resultData = query;
                    query = ['*'];
                }
                //注册事件
                this.on("success", resultData);
                this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readonly').objectStore(this.name);
                var i = 0;
                var data = [];
                var keyRangeValue = query[0] === '*' ? null : getKeyRangeValue(query[1]);
                var self = this;
                var result = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        i++;
                        data.push(cursor.value);
                        cursor.continue();
                    } else {
                        self.emit("success", {
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
                    self.emit("error", {
                        error: 1010,
                        message: 'find error',
                        data: e
                    });
                };

                if (query[0] === objectStore.keyPath || query[0] === '*') {
                    objectStore.openCursor(keyRangeValue, query[2] === undefined ? 'prev' : query[2]).onsuccess = function(e) {
                        result(e);
                    };
                } else {
                    objectStore.index(query[0] + 'Index').openCursor(keyRangeValue, query[2] === undefined ? 'prev' : query[2]).onsuccess = function(e) {
                        result(e);
                    };
                }

                return this;
            },
            insert: function (doc, resultData) {
                this.on("success", resultData);
                this.on("error", resultData);

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
                this.on("success", resultData);
                this.on("error", resultData);

                var self = this;
                var count = 0;
                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);
                var total = (arrayData === null || arrayData === undefined) ? 0 : arrayData.length;
                if(total === 0){
                    self.emit('error', {
                        error: 1,
                        message: 'no data!'
                    });
                }else{
                    /* jshint loopfunc:true */
                    for(var i=0; i<total; i++){
                        objectStore.add(arrayData[i]).onsuccess = function(e) {
                            self.emit('success', {
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
                this.on("success", resultData);
                this.on("error", resultData);

                if(doc === undefined || isEmptyObject(doc)) {
                    throw 'no update data';
                }
                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);
                objectStore.put(doc).onsuccess = function(e) {
                    resultData({
                        error: 0,
                        message: 'save success!'
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

                this.on("success", resultData);
                this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);
                var self = this;
                if(query[0] === '*') {
                    objectStore.clear().onsuccess = function(e) {
                        self.emit("success", {
                            error: 0,
                            message: "clear success!"
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
                            self.emit("success", {
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
                this.on("success", resultData);
                this.on("error", resultData);

                var objectStore = this.getDatabase().transaction([this.name], 'readwrite').objectStore(this.name);

                var self = this;
                objectStore.transaction.onerror = function(e){
                    self.emit('error', {
                        error: 0,
                        message: 'action fail!',
                        data: e
                    });
                };
                objectStore.count().onsuccess = function(e) {
                    self.emit('success', {
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
             * 刪除集合
             * @param  {[type]} resultData [description]
             * @return {[type]}            [description]
             */
            drop: function (resultData) {
                this.on("success", resultData);
                this.on("error", resultData);

                var openDBRequest = this.result.updateVersion(this.getDatabase()); //更新版本
                console.log(openDBRequest);

                var self = this;
                openDBRequest.onupgradeneeded = function(e) {
                    self.result.database = e.target.result;
                    self.getDatabase().deleteObjectStore(self.name); //value is undefined
                    delete self.result[self.name];
                    self.emit("success", {
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

        // this.onopen = null;

        // this.onerror = null;
        //
        // this.onsuccess = null;

        this.emit = function (status, data) {
            var callback = this['on' + status];
            if(typeof callback === 'function') {
                callback(data);
            }
        };

        this.on = function (status, callback) {
            if(typeof callback === 'function') {
                this['on' + status] = callback;
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
            this.on('open', resultData);
            this.on('success', resultData);
            this.on('error', resultData);
            this.on('open', resultData);

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

                    self.emit("open", {
                        error: 0,
                        message: 'open success!',
                        result: self
                    });
                };

                openDBRequest.onerror = function(e) {
                    self.emit("error", {
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
