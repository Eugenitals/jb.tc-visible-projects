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

        /** @type {Object} */
        _rootProject: null,

        /** @type {Object} */
        _lastFilteredMap: null,

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
         * Returns a map of projects that matched with filter
         * @param filter {String}
         * @param [isProgressive] {Boolean} true to filter through last filtered projects
         * @return {Object} map of visible projects
         */
        _getFilteredProject: function (filter, isProgressive) {
            if (! this._projects || ! this._projects.length) {
                return {};
            }

            // Fastest for empty filter only
            if (! filter.length) {
                // todo: exclude selected projects
                return this._lastFilteredMap = this._projects._index;
            }

            var preFiltered = {};
            preFiltered[ this._rootProject.id ] = true;

            var allowed = isProgressive
                ? this._lastFilteredMap
                : null

            return this._lastFilteredMap = this._filterProject(this._rootProject, filter, preFiltered, {}, allowed);
        },

        // todo: exclude selected projects
        /**
         * Recursively search projects by filter
         * @param project {Object} current project
         * @param filter {String} current filter
         * @param filteredMap {Object} map of already matched projects
         * @param excludedMap {Object} map of projects excluded from filtration
         * @param [allowedMap] {Object} map of projects available for filtration
         * @return {Object} extended filteredMap
         */
        _filterProject: function (project, filter, filteredMap, excludedMap, allowedMap) {
            var match = false;

            // If excluded or no allowed
            if (excludedMap[ project.id ] || (allowedMap && !allowedMap[ project.id ])) {
                return filteredMap;
            }

            if (! filter) {
                filteredMap[ project.id ] = true;
            } else {
                var filterParts = filter.split(' ');
                var regexp = new RegExp('(' + filterParts.map(_.escapeRegExp).join(').+(') + ')', 'i');

                if (regexp.test(project._fullName)) {
                    match = true;

                    // Display all parents
                    var _parent = this._projects._index[ project.parentProjectId ];
                    while (! filteredMap[_parent.id]) {
                        filteredMap[ _parent.id ] = true;
                        _parent = this._projects._index[ _parent.parentProjectId ];
                    }
                    _parent = null;

                    // Display current project
                    filteredMap[ project.id ] = true;
                }
            }

            // Iterate children
            if (project._children.length) {
                for (var i = 0, len = project._children.length; i < len; i++) {
                    this._filterProject(project._children[i], match ? null : filter, filteredMap, excludedMap, allowedMap);
                }
            }

            return filteredMap;
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         */
        _onProjectsLoaded: function (projects) {
            this._projects = this._parseProjects(projects);
            this._ioRenderHiddenProjects(this._getProjectNodes(this._rootProject).slice(1)/* Omit root project */);
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