/**
 @polymerBehavior Polymer.jb.TcVisibleProjectsBehavior
 */

"use strict";

(function (Polymer, Ajax, _, Map) {
    var Errors = {
        COMMUNICATION_ERROR: _.template('Server "<%= url %>" returned status <%= status %>'),
        CAN_NOT_PARSE_RESPONSE: 'Error while parse response'
    };

    Polymer.jb = Polymer.jb || {};

    /** @polymerBehavior Polymer.jb.TcVisibleProjectsBehavior */
    Polymer.jb.TcVisibleProjectsBehavior = {
        /**
         * Load projects JSON by url
         * @param url {String}
         */
        loadProjects: function (url) {
            if (! url) {
                return;
            }

            this._ioSetLoading(true);

            new Ajax(url, {
                context: this,
                success: function (_responseText) {
                    var responseData;

                    try {
                        responseData = JSON.parse(_responseText);
                    }
                    catch (e) {
                        return this._onProjectsLoadError(new Error(Errors.CAN_NOT_PARSE_RESPONSE));
                    }

                    this._onProjectsLoaded(responseData.project);
                },
                error: function (ajax, status) {
                    this._onProjectsLoadError(new Error(Errors.COMMUNICATION_ERROR({ url: ajax.url, status: status })));
                },
                done: function () {
                    this._ioSetLoading(false);
                }
            });
        },

        /** @type {Map} */
        _projectsMap: null,

        /** @type {Map} */
        _filteredProjectsMap: null,

        /** @type {Object} */
        _rootProject: null,

        /**
         * @param rawProjects {Array<{ id:String, parentProjectId:String, name:String }>}
         * @return {Map}
         */
        _parseProjects: function (rawProjects) {
            var resultMap = new Map();

            // Handle Root project
            var _project = rawProjects[0];
            _project._level = 0;
            _project._fullName = '';

            resultMap.set(_project.id, _project);

            // Save root project ID
            this._rootProject = _project;

            var _parent;
            for (var i = 1/* Omit root project */, len = rawProjects.length; i < len; i++ ) {
                _project = rawProjects[i];
                _parent = resultMap.get(_project.parentProjectId);
                _project._level = _parent._level + 1;
                _project._fullName = _parent._fullName + '::' + _project.name.toLowerCase();

                resultMap.set(_project.id, _project);
            }

            return resultMap;
        },

        /**
         * 1. Split filter string by ' ' symbol into parts
         * 2. Escape each part
         * 3. Join parts to get string like this -> '(part1).+(part2).+(partN)'
         * 4. Make case insensitive RegExp
         * @param filter {String}
         * @return {RegExp}
         */
        _getRegExpByFilter: function (filter) {
            return new RegExp('(' + filter.split(' ').map(_.escapeRegExp).join(').+(') + ')', 'i');
        },

        /**
         * @param filter {String}
         * @param [isProgressive] {Boolean} true to filter over current _filteredProjectsMap
         * @return {Array<Strings>} valid HTML strings elements
         */
        _filterProjectsNodes: function (filter, isProgressive) {
            var projectsMap = isProgressive
                ? this._filteredProjectsMap || this._projectsMap
                : this._projectsMap;

            if (! projectsMap.size) {
                return [];
            }

            var projectsArr = Array.from(projectsMap.values());
            var filteredProjects = [];
            var nodes = [];
            var _project, _projectIndex, _parent, _child; // Cursors

            // Fastest way for empty filter only
            if (! filter.length) {
                for (var i = 1 /* Omit root project */, len = projectsArr.length; i < len; i++) {
                    _project = projectsArr[i];
                    nodes.push(this._ioGetProjectHTML(projectsArr[i]));
                }
            }

            // For defined filter
            else {
                // Mark Root as already displayed
                filteredProjects = [[this._rootProject.id, this._rootProject]];
                filteredProjects[this._rootProject.id] = true;

                var regexp = this._getRegExpByFilter(filter);

                for (var j = 1 /* Omit root project */, len = projectsArr.length; j < len; j++) {
                    _project = projectsArr[j];

                    if (regexp.test(_project._fullName)) {
                        _projectIndex = nodes.length;

                        // Display current project
                        nodes.push(this._ioGetProjectHTML(_project, filter));
                        filteredProjects.push([_project.id, _project]);
                        filteredProjects[_project.id] = true;

                        // Display all parents
                        _parent = projectsMap.get(_project.parentProjectId);
                        while (! filteredProjects[_parent.id]) {
                            nodes.splice(_projectIndex, 0, this._ioGetProjectHTML(_parent, filter));
                            filteredProjects.splice(_projectIndex, 0, [_parent.id, _parent]);
                            filteredProjects[_parent.id] = true;
                            _parent = projectsMap.get(_parent.parentProjectId);
                        }
                        _parent = null;

                        // Display all children
                        _child = projectsArr[j + 1];
                        while (_child && _child._level > _project._level) {
                            nodes.push(this._ioGetProjectHTML(_child, filter));
                            filteredProjects.push([_child.id, _child]);
                            filteredProjects[_child.id] = true;
                            j++;
                            _child = projectsArr[j + 1];
                        }
                        _child = null;
                    }
                }

                this._filteredProjectsMap = new Map(filteredProjects);
            }

            return nodes;
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         */
        _onProjectsLoaded: function (projects) {
            this._projectsMap = this._parseProjects(projects);
            this._ioApplyCurrentFilter();
        },

        /**
         * @param error {Error}
         */
        _onProjectsLoadError: function (error) {
            this._ioShowError(error.message, 'LOAD_PROJECTS_ERROR');
        }
    };
})(window.Polymer || {}, window.Ajax, window._, window.Map);