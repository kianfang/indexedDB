module.exports = function(grunt) {
    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        // concat: {
        //     options: {
        //         separator: ';',
        //     },
        //     app: {
        //         src: [
        //             './bower_components/jquery/dist/jquery.js',
        //             './bower_components/bootstrap/dist/js/bootstrap.js'
        //         ],
        //         dest: './public/admin/0/js/jquery_bootstrap.js'
        //     }
        // },
        uglify: {
            options: {
                banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
            },
            app: {
                files: {
                    './dist/indexeddb.min.js': './src/indexedDB.js'
                }
                // src: 'src/<%= pkg.name %>.js',
                // dist: 'dist/<%= pkg.name %>.min.js'
            }
        },
        jshint: {
            app: ['Gruntfile.js', './src/**/*.js', './dist/**/dist/*.js']
        },
        copy: {
            jquery: {
                files: [{ //jquery1、2、3
                    expand: true,
                    flatten: false,
                    cwd: './bower_components/jquery/dist/',
                    src: ['jquery.min.js'],
                    dest: './examples/js/',
                    filter: 'isFile',
                }]
            }
        },
        watch: {
            jquery: {
                files: ['./bower_components/jquery*/dist/jquery.min.js'], // jquery 监听
                tasks: ['copy:jquery']
            }
        }
    });

    // 加载包含 "uglify" 任务的插件。
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-contrib-copy');
    // 默认被执行的任务列表。

    grunt.registerTask('default', [/*'concat', */'uglify', 'jshint', 'copy']);

};
