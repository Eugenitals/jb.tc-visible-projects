/**
 @polymerBehavior Polymer.jb.TcVisibleProjectsBehavior
 */

"use strict";

(function (Polymer, Ajax, _) {
    var Errors = {
        COMMUNICATION_ERROR: _.template('Server "<%= url %>" returned status <%= status %>'),
        CAN_NOT_PARSE_RESPONSE: 'Error while parse response',
        PROJECT_NOT_FOUND: _.template('Project <%= id %> is not found')
    };

    function cloneSimpleObject(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

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
        _currentFilteredProjects: null,

        /** @type {Array} */
        _selectedProjects: null,

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

        _parseSelectedProjects: function (selectedProjectsList) {
            var deletedProjects = {};
            this._selectedProjects = [];
            this._selectedProjects._index = {};

            if (selectedProjectsList.length) {
                var _project;
                for (var i = 0, len = selectedProjectsList.length; i < len; i++) {
                    _project = this._projects._index[ selectedProjectsList[i] ];

                    // Project may be already deleted
                    if (! _project) {
                        deletedProjects[ selectedProjectsList[i] ] = true;
                        continue;
                    }

                    this._addSelectedProject(_project, true);
                }
            }
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

        _getSelectedProjectNodes: function (projects) {
            var html = [];

            var _project;
            for (var i = 0, len = projects.length; i < len; i++) {
                _project = projects[i];
                html.push(this._ioGetProjectHTML(_project));

                if (_project._children.length) {
                    html.push.apply(html, this._getSelectedProjectNodes(_project._children))
                }
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
                this._currentFilteredProjects = {};
                var _projectsIds = Object.keys(this._projects._index);

                // Omit selected projects
                for (var i = 0, len = _projectsIds.length; i < len; i ++) {
                    if (! this._selectedProjects._index[ _projectsIds[i] ]) {
                        this._currentFilteredProjects[ _projectsIds[i] ] = true;
                    }
                }

                return this._currentFilteredProjects;
            }

            var preFiltered = {};
            preFiltered[ this._rootProject.id ] = true;

            var allowed = isProgressive
                ? this._currentFilteredProjects
                : null

            return this._currentFilteredProjects
                = this._filterProject(this._rootProject, filter, preFiltered, {}, allowed);
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

        _getProjectById: function (id) {
            if (! this._projects || ! this._projects._index[ id ]) {
                return this._ioFireError(Errors.PROJECT_NOT_FOUND({ id: id }), 'PROJECT_NOT_FOUND');
            }

            return this._projects._index[ id ];
        },

        /**
         * Init selection projects
         * @param selected {[{name:String, id:String}]}
         */
        _setSelectedProjects: function (selected) {
            this._selectedProjects = selected || [];

            if (this._projects) {
                this._parseSelectedProjects(this._selectedProjects);
                this._ioRenderVisibleProjects(this._getSelectedProjectNodes(this._selectedProjects));
            }

            //todo: filter
        },

        _getSelectedProjects: function () {
            return this._selectedProjects;
        },

        _selectProject: function (projectId) {
            var project = this._getProjectById(projectId);

            if (! project) {
                return;
            }

            // Check for selection availability
            if (this._selectedProjects._index[ project.id ] || ! this._currentFilteredProjects[ project.id ]) {
                return;
            }

            this._addSelectedProject(project);
            this._ioRenderVisibleProjects(this._getSelectedProjectNodes(this._selectedProjects));
        },

        /**
         * Select project and all his visible children
         * @param project {Object}
         */
        _addSelectedProject: function (project, ignoreChildren) {
            var _selectedProject = cloneSimpleObject(project);
            _selectedProject._children = [];
            var _parent = this._projects._index [ project.parentProjectId ];
            var _selectedParent;

            while (_parent !== this._rootProject) {
                if (this._selectedProjects._index[ _parent.id ]) {
                    _selectedParent = this._selectedProjects._index[ _parent.id ];
                    break;
                }
                else {
                    // Extend child name
                    _selectedProject.name = _parent.name + ' → ' + _selectedProject.name;
                }
                _parent = this._projects._index[ _parent.parentProjectId ];
            }

            if (_selectedParent) {
                _selectedProject._level = _selectedParent._level + 1;
                _selectedParent._children.push(_selectedProject);
            } else {
                _selectedProject._level = 1;
                this._selectedProjects.push(_selectedProject);
            }

            // Add to index
            this._selectedProjects._index[ _selectedProject.id ] = _selectedProject;

            // Select children
            if (! ignoreChildren && project._children.length) {
                for (var i = 0, len = project._children.length; i < len; i++) {
                    this._addSelectedProject(project._children[i]);
                }
            }
        },

        _unselectProject: function (projectId) {
            var project = this._getProjectById(projectId);

            if (! project) {
                return;
            }
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         */
        _onProjectsLoaded: function (projects) {
            this._projects = this._parseProjects(projects);
            this._parseSelectedProjects(this._selectedProjects);
            this._currentFilteredProjects = this._projects._index;
            this._ioRenderVisibleProjects(this._getSelectedProjectNodes(this._selectedProjects));
            this._ioRenderHiddenProjects(this._getProjectNodes(this._rootProject).slice(1)/* Omit root project */);
            this._ioApplyCurrentFilter();
        },

        /**
         * @param error {Error}
         */
        _onProjectsLoadError: function (error) {
            this._ioFireError(error.message, 'LOAD_PROJECTS_ERROR');
        }
    };
})(window.Polymer || {}, window.Ajax, window._);