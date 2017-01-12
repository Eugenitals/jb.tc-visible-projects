/**
 @polymerBehavior Polymer.jb.TcVisibleProjectsBehavior
 */

"use strict";

(function (Polymer, Ajax, _) {
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

        /** @type {Array} */
        _projects: null,

        /** @type {Map} */
        _filteredProjectsMap: null,

        /** @type {Object} */
        _rootProject: null,

        /**
         * @param rawProjects {Array<{ id:String, parentProjectId:String, name:String }>}
         * @return {Array}
         */
        _parseProjects: function (rawProjects) {
            var result = [];
            result._index = {};

            // Handle Root project
            var _project = rawProjects[0];
            _project._level = 0;
            _project._fullName = '';
            _project._children = [];
            result.push(_project);
            result._index[ _project.id ] = _project;

            // Save root project ID
            this._rootProject = _project;

            var _parent;
            for (var i = 1/* Omit root project */, len = rawProjects.length; i < len; i++ ) {
                _project = rawProjects[i];
                _parent = result._index[ _project.parentProjectId ];

                _project._children = [];
                _project._level = _parent._level + 1;
                _project._fullName = _parent._fullName + '::' + _project.name.toLowerCase();
                result._index[ _project.id ] = _project;

                _parent._children.push(_project);
            }

            return result;
        },

        /**
         * @param project {Object}
         * @return {Array<String>}
         */
        _getProjectNodes: function (project) {
            var html = [ this._ioGetProjectHTML(project) ];

            if (project._children.length) {
                var self = this;
                project._children.forEach(function (_project) {
                    html.push.apply(html, self._getProjectNodes(_project));
                })
            }

            return html;
        },

        /**
         * @param filter {String}
         * @param [isProgressive] {Boolean} true to filter over current _filteredProjectsMap
         * @return {Object} map of visible projects
         */
        _getFilteredProject: function (filter, isProgressive) {
            if (! this._projects || ! this._projects.length) {
                return {};
            }

            // Fastest for empty filter only
            if (! filter.length) {
                return this._projects._index;
            }

            return this._filterProject(this._rootProject, filter, {});
        },

        _filterProject: function (project, filter, filtered) {
            var match = false;

            if (! filter) {
                filtered[ project.id ] = true;
            } else {
                var filterParts = filter.split(' ');
                var regexp = new RegExp('(' + filterParts.map(_.escapeRegExp).join(').+(') + ')', 'i');

                if (regexp.test(project._fullName)) {
                    match = true;

                    // Display all parents
                    var _parent = this._projects._index[ project.parentProjectId ];
                    while (_parent !== this._rootProject && !filtered[_parent.id]) {
                        filtered[ _parent.id ] = true;
                        _parent = this._projects._index[ _parent.parentProjectId ];
                    }
                    _parent = null;

                    // Display current project
                    filtered[ project.id ] = true;
                }
            }

            // Iterate children
            if (project._children.length) {
                for (var i = 0, len = project._children.length; i < len; i++) {
                    this._filterProject(project._children[i], match ? null : filter, filtered);
                }
            }

            return filtered;
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         */
        _onProjectsLoaded: function (projects) {
            var ts = (new Date()).getTime();
            this._projects = this._parseProjects(projects);
            this._ioRenderHiddenProjects(this._getProjectNodes(this._rootProject).slice(1)/* Omit root project */);
            console.log('Initial render time: ', (new Date()).getTime() - ts);
            this._ioApplyCurrentFilter();
        },

        /**
         * @param error {Error}
         */
        _onProjectsLoadError: function (error) {
            this._ioShowError(error.message, 'LOAD_PROJECTS_ERROR');
        }
    };
})(window.Polymer || {}, window.Ajax, window._);