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

    /**
     * Return topologically sorted list of projects IDs
     * @param projects {Array<Object>}
     * @param [acl] {Object} map of available projects
     * @return {Array<String>}
     */
    function getProjectsFlatIds(projects, acl) {
        var result = [];

        if (projects.length) {
            projects.forEach(function (_project) {
                if (acl) {
                    if (acl[ _project.id ]) {
                        result.push(_project.id);
                    }
                } else {
                    result.push(_project.id);
                }
                result.push.apply(result, getProjectsFlatIds(_project._children, acl));
            });
        }

        return result;
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

        /**
         * Move selected project down (or up) inside its parent
         * @param selectedProjectId {String}
         * @param [isReverse] {Boolean} true to move project up
         */
        shiftProject: function (selectedProjectId, isReverse) {
            var selectedProject = this._selectedProjects._index[ selectedProjectId ];
            if (! selectedProject) {
                return;
            }
            var selectedProjectParent = this._getSelectedProjectParent(selectedProject);
            var array;
            if (selectedProjectParent) {
                array = selectedProjectParent._children;
            } else {
                array = this._selectedProjects;
            }
            var index = array.indexOf(selectedProject);

            // Shift DOWN
            if (isReverse) {
                if (index < 1) {
                    return;
                } else {
                    var temp = array[index - 1];
                    array[index - 1] = array[index];
                    array[index] = temp;
                    this._setSelectedProjects(this._getSelectedProjects());
                }
            }

            // Shift Up
            else {
                if (index === array.length - 1) {
                    return;
                } else {
                    var temp = array[index + 1];
                    array[index + 1] = array[index];
                    array[index] = temp;
                    this._setSelectedProjects(this._getSelectedProjects());
                }
            }
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

        _parseSelectedProjects: function () {
            var deletedProjects = {};
            var projectIds = this._selectedProjects;

            this._selectedProjects = [];
            this._selectedProjects._index = {};

            if (projectIds.length) {
                var _project;
                for (var i = 0, len = projectIds.length; i < len; i++) {
                    _project = this._projects._index[ projectIds[i] ];

                    // Project may be already deleted
                    if (! _project) {
                        deletedProjects[ projectIds[i] ] = true;
                        continue;
                    }

                    this._addSelectedProject(_project, projectIds, true);
                }
            }
        },

        /**
         * @param project {Object}
         * @return {Array<String>}
         */
        _getProjectNodes: function (project) {
            var html = [ this._ioGetHiddenProjectHTML(project) ];

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
                html.push(this._ioGetVisibleProjectHTML(_project));

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

            var preFiltered = {};
            preFiltered[ this._rootProject.id ] = true;

            var allowed = isProgressive
                ? this._currentFilteredProjects
                : null

            return this._currentFilteredProjects
                = this._filterProject(this._rootProject, filter, preFiltered, this._selectedProjects._index, allowed);
        },

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
            excludedMap = excludedMap || {};
            var match = false;

            // If no allowed
            if (allowedMap && ! allowedMap[ project.id ]) {
                return filteredMap;
            }

            if (! excludedMap[ project.id ]) {
                if (! filter) {
                    match = true;
                } else {
                    var filterParts = filter.split(' ');
                    var regexp = new RegExp('(' + filterParts.map(_.escapeRegExp).join(').+(') + ')', 'i');

                    if (regexp.test(project._fullName)) {
                        match = true;
                    }
                }

                if (match) {
                    // Display all parents
                    var _parent = this._projects._index[ project.parentProjectId ];
                    while (_parent && !filteredMap[_parent.id]) {
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
         * Init selection projects
         * @param selected {[{name:String, id:String}]}
         */
        _setSelectedProjects: function (selected) {
            this._selectedProjects = selected || [];

            if (this._projects) {
                this._parseSelectedProjects();
                this._ioRenderVisibleProjects(this._getSelectedProjectNodes(this._selectedProjects));
            }
        },

        _getSelectedProjects: function () {
            return getProjectsFlatIds(this._selectedProjects, this._selectedProjects._index);
        },

        /**
         * Set project from list selected
         * @param project {Object}
         * @param projectsList {Array} list of IDs of all projects that will be selected
         * @param [ignoreChildren] {Boolean}
         * @return {Object} selectedProject
         */
        _addSelectedProject: function (project, projectsList, ignoreChildren) {
            if (this._selectedProjects._index[ project.id ]) {
                return this._selectedProjects._index[ project.id ];
            }

            var _selectedProject = cloneSimpleObject(project);
            _selectedProject._children = [];
            var _parent = this._projects._index [ project.parentProjectId ];
            var _selectedParent;

            while (_parent) {
                if (projectsList.indexOf(_parent.id) !== -1) {
                    // Add parent before child
                    _selectedParent
                        = this._addSelectedProject(this._projects._index[ _parent.id ], projectsList, ignoreChildren);
                    break;
                }
                else if (_parent !== this._rootProject) {
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
            var _children;
            if (! ignoreChildren && project._children.length) {
                for (var i = 0, len = project._children.length; i < len; i++) {
                    _children = project._children[i];
                    if (projectsList.indexOf(_children.id) !== -1) {
                        this._addSelectedProject(_children, projectsList);
                    }
                }
            }

            return _selectedProject;
        },

        /**
         * @param selectedProject {Object}
         * @param [ignoreParent] {Boolean}
         */
        _removeSelectedProject: function (selectedProject, ignoreParent) {
            // Unselect all children
            if (selectedProject._children.length) {
                var _children = selectedProject._children.slice();
                for (var i = 0, len = _children.length; i < len; i++) {
                    this._removeSelectedProject(_children[i], true);
                }
            }

            // Get selected parent
            var parent = this._projects._index[ selectedProject.parentProjectId ];
            var selectedParent;
            while (parent) {
                if (this._selectedProjects._index[ parent.id ]) {
                    selectedParent = this._selectedProjects._index[ parent.id ];
                    break;
                }
                parent = this._projects._index[ parent.parentProjectId ];
            }

            if (selectedParent) {
                selectedParent._children.splice(selectedParent._children.indexOf(selectedProject), 1);

                // Remove parent
                if (!ignoreParent && ! selectedParent._children.length) {
                    this._removeSelectedProject(selectedParent);
                }
            } else {
                this._selectedProjects.splice(this._selectedProjects.indexOf(selectedProject), 1);
            }

            // Delete index
            delete this._selectedProjects._index[ selectedProject.id ];
        },

        _selectProject: function (projectId) {
            var project = this._projects._index[ projectId ];

            if (! project) {
                return;
            }

            // Check for selection availability
            if (! this._currentFilteredProjects[ project.id ]) {
                return false;
            }

            // Select each available children
            var projectsIds = getProjectsFlatIds([ project ], this._currentFilteredProjects);
            var _projectId = [];
            for (var  i = 0, len = projectsIds.length; i <len; i++) {
                _projectId = projectsIds[i];
                this._addSelectedProject(this._projects._index[ _projectId ], projectsIds);
            }

            // Update selected projects
            this._setSelectedProjects(this._getSelectedProjects());
            this._ioApplyCurrentFilter(true);
            return true;
        },

        _unselectProject: function (projectId) {
            var selectedProject = this._selectedProjects._index[ projectId ];

            if (! selectedProject) {
                return false;
            }

            this._removeSelectedProject(selectedProject);
            this._setSelectedProjects(this._getSelectedProjects());
            this._ioApplyCurrentFilter(true);
            return true;
        },

        _getSelectedProjectParent: function (selectedProject) {
            var parent = this._projects._index[selectedProject.parentProjectId];

            if (!parent) {
                return null;
            }

            while (parent) {
                if (this._selectedProjects._index[parent.id]) {
                    return this._selectedProjects._index[parent.id];
                }
                parent = this._projects._index[parent.parentProjectId];
            }
        },


        /**
         * @param result {{count: Number, href: String, project: Array}}
         */
        _onProjectsLoaded: function (projects) {
            this._projects = this._parseProjects(projects);
            this._currentFilteredProjects = this._projects._index;
            this._ioRenderHiddenProjects(this._getProjectNodes(this._rootProject).slice(1)/* Omit root project */);
            this._setSelectedProjects(this._selectedProjects);
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