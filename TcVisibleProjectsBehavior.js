/**
 @polymerBehavior Polymer.jb.TcVisibleProjectsBehavior
 */

"use strict";

(function (Polymer, Ajax, _, Map) {
    var Errors = {
        COMMUNICATION_ERROR: _.template('Server "<%= url %>" returned status <%= status %>'),
        CAN_NOT_PARSE_RESPONSE: 'Error while parse response',
        PROJECT_NOT_FOUND: _.template('Project <%= id %> is not found')
    };

    /**
     * TreeNode class
     * @param id {String}
     * @param name {String}
     * @param parent {TreeNode}
     * @constructor
     */
    function TreeNode(id, name, parent) {
        this.id = id;
        this.name = name;
        this.parent = parent;
        this.children = [];
        this.level = 0;
        this.fullName = name;

        if (parent) {
            this.level = parent.level + 1;
            this.fullName = parent.fullName + '::' + name.toLowerCase();
        }
    }
    TreeNode.prototype.valueOf = TreeNode.prototype.toString = function () {
        return this.id;
    }

    /**
     * Tree class
     * @param root {TreeNode}
     * @constructor
     */
    function Tree(root) {
        this.root = root;
        this._index = {};
        this._index[ root.id ] = root;
    }
    Tree.prototype.add = function (node) {
        var parent = node.parent || this.root;
        parent.children.push(node);
        this._index[ node.id ] = node;
        return node;
    };
    Tree.prototype.remove = function (nodeId) {
        var node = this._index[ nodeId ];
        var parent = node.parent;
        parent.children.splice(parent.children.indexOf(node), 1);
        delete this._index[ nodeId ];
        return node;
    };
    Tree.prototype.get = function (nodeId) {
        return this._index[ nodeId ];
    }
    Tree.prototype.index = function () {
        return this._index;
    }

    /**
     * Return topologically sorted list of nodes IDs
     * @param node {TreeNode}
     * @param [acl] {Object} map of available nodes
     * @return {Array<String>}
     */
    Tree.nodeToArray = function (node, acl) {
        var result = [];

        if (acl) {
            if (acl[ node.id ]) {
                result.push(node.id);
            }
        } else {
            result.push(node.id);
        }

        if (node.children.length) {
            for (var i = 0, len = node.children.length; i < len; i++) {
                result.push.apply(result, Tree.nodeToArray(node.children[i], acl));
            }
        }

        return result;
    }
    
    var ProjectsMap = new Map();

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
         * @param projectId {String}
         * @param [isReverse] {Boolean} true to move project up
         */
        shiftProject: function (projectId, isReverse) {
            var node = this._selectedTree.get(projectId);
            if (! node) {
                return;
            }

            var children = node.parent.children;
            var index = children.indexOf(node);

            // Shift DOWN
            if (isReverse) {
                if (index < 1) {
                    return;
                } else {
                    var temp = children[index - 1];
                    children[index - 1] = children[index];
                    children[index] = temp;
                    this._setSelectedProjects(this._getSelectedProjects());
                }
            }

            // Shift Up
            else {
                if (index === children.length - 1) {
                    return;
                } else {
                    var temp = children[index + 1];
                    children[index + 1] = children[index];
                    children[index] = temp;
                    this._setSelectedProjects(this._getSelectedProjects());
                }
            }
        },

        /** @type {Tree} */
        _projectsTree: null,

        /** @type {Tree} */
        _selectedTree: null,

        /** @type {Object} */
        _rootProject: null,

        /** @type {Object} */
        _currentFilteredProjects: null,

        /** @type {Array<String>} */
        _selectedProjects: null,

        /**
         * @param rawProjects {Array<{ id:String, parentProjectId:String, name:String }>}
         * @return {Tree}
         */
        _getProjectsTree: function (rawProjects) {
            this._rootProject = rawProjects[0];
            ProjectsMap.set(this._rootProject.id, this._rootProject);
            var tree = new Tree(new TreeNode(this._rootProject.id, '', null));

            var _project, _parentProject, _node, _parentNode;
            for (var i = 1/* Omit root project */, len = rawProjects.length; i < len; i++ ) {
                _project = rawProjects[i];
                _parentProject = ProjectsMap.get(_project.parentProjectId);
                _parentNode = tree.get(_parentProject.id);
                tree.add(new TreeNode(_project.id, _project.name, _parentNode));
                ProjectsMap.set(_project.id, _project);
            }

            return tree;
        },

        /**
         * @return {Tree}
         */
        _parseSelectedProjects: function () {
            var deletedProjects = {};
            var projectIds = this._selectedProjects;
            this._selectedTree = new Tree(new TreeNode(this._rootProject.id, '', null));

            if (projectIds.length) {
                var _project;
                for (var i = 0, len = projectIds.length; i < len; i++) {
                    _project = ProjectsMap.get(projectIds[i]);

                    // Project may be already deleted
                    if (! _project) {
                        deletedProjects[ projectIds[i] ] = true;
                        continue;
                    }

                    this._addSelectedProject(_project, projectIds);
                }
            }
        },

        /**
         * @param node {TreeNode}
         * @return {Array<String>}
         */
        _getProjectNodes: function (node) {
            var html = [ this._ioGetHiddenProjectHTML(ProjectsMap.get(node.id), node.level) ];

            if (node.children.length) {
                var self = this;
                node.children.forEach(function (_node) {
                    html.push.apply(html, self._getProjectNodes(_node));
                })
            }

            return html;
        },

        /**
         * @param node {TreeNode}
         * @return {Array<String>}
         */
        _getSelectedProjectNodes: function (node) {
            var html = [ this._ioGetVisibleProjectHTML(ProjectsMap.get(node.id), node.name, node.level) ];

            if (node.children.length) {
                var self = this;
                node.children.forEach(function (_node) {
                    html.push.apply(html, self._getSelectedProjectNodes(_node));
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
            if (! this._projectsTree) {
                return {};
            }

            var preFiltered = {};
            preFiltered[ this._rootProject.id ] = true;

            var allowed = isProgressive
                ? this._currentFilteredProjects
                : null

            return this._currentFilteredProjects
                = this._filterProject(this._projectsTree.root, filter, preFiltered, this._selectedTree.index(), allowed);
        },

        /**
         * Recursively search projects by filter
         * @param node {TreeNode} project node
         * @param filter {String} current filter
         * @param filteredMap {Object} map of already matched projects
         * @param excludedMap {Object} map of projects excluded from filtration
         * @param [allowedMap] {Object} map of projects available for filtration
         * @return {Object} extended filteredMap
         */
        _filterProject: function (node, filter, filteredMap, excludedMap, allowedMap) {
            excludedMap = excludedMap || {};
            var match = false;

            // If no allowed
            if (allowedMap && ! allowedMap[ node.id ]) {
                return filteredMap;
            }

            if (! excludedMap[ node.id ]) {
                if (! filter) {
                    match = true;
                } else {
                    var filterParts = filter.split(' ');
                    var regexp = new RegExp('(' + filterParts.map(_.escapeRegExp).join(').+(') + ')', 'i');

                    if (regexp.test(node.fullName)) {
                        match = true;
                    }
                }

                if (match) {
                    // Display all parents
                    var _parentNode = node.parent;
                    while (_parentNode && !filteredMap[_parentNode.id]) {
                        filteredMap[ _parentNode.id ] = true;
                        _parentNode = _parentNode.parent;
                    }
                    _parentNode = null;

                    // Display current project
                    filteredMap[ node.id ] = true;
                }
            }

            // Iterate children
            if (node.children.length) {
                for (var i = 0, len = node.children.length; i < len; i++) {
                    this._filterProject(node.children[i], match ? null : filter, filteredMap, excludedMap, allowedMap);
                }
            }

            return filteredMap;
        },

        /**
         * Init selection projects
         * @param selected {Array<String>}
         */
        _setSelectedProjects: function (selected) {
            this._selectedProjects = selected || [];

            if (this._projectsTree) {
                this._parseSelectedProjects();
                this._ioRenderVisibleProjects(this._getSelectedProjectNodes(this._selectedTree.root).slice(1)/* Omit root project */);
            }
        },

        _getSelectedProjects: function () {
            return Tree.nodeToArray(this._selectedTree.root, this._selectedTree.index());
        },

        /**
         * Set project from list selected
         * @param project {Object}
         * @param projectsList {Array} list of IDs of all projects that will be selected
         * @return {TreeNode} selected project node
         */
        _addSelectedProject: function (project, projectsList) {
            if (this._selectedTree.get(project.id)) {
                return this._selectedTree.get(project.id);
            }

            var parentProject = ProjectsMap.get(project.parentProjectId);
            var nodeName = project.name;
            var parentNode;
            while (parentProject) {
                if (projectsList.indexOf(parentProject.id) !== -1) {
                    // Add parent node before child
                    parentNode = this._addSelectedProject(ProjectsMap.get(parentProject.id), projectsList);
                    break;
                }
                else if (parentProject !== this._rootProject) {
                    // Extend node name
                    nodeName = parentProject.name + ' → ' + nodeName;
                } else {
                    parentNode = this._selectedTree.root;
                    break;
                }
                parentProject = ProjectsMap.get(parentProject.parentProjectId);
            }

            // Add Node
            return this._selectedTree.add(new TreeNode(project.id, nodeName, parentNode));
        },

        /**
         * @param node {TreeNode}
         * @param [ignoreParent] {Boolean}
         */
        _removeSelectedProject: function (node, ignoreParent) {
            if (node === this._selectedTree.root) {
                return;
            }

            // Un-select all children
            if (node.children.length) {
                var _children = node.children.slice();
                for (var i = 0, len = _children.length; i < len; i++) {
                    this._removeSelectedProject(_children[i], true);
                }
            }

            var parentNode = node.parent;
            this._selectedTree.remove(node.id);

            // Remove parent
            if (!ignoreParent && !parentNode.children.length) {
                this._removeSelectedProject(parentNode);
            }
        },

        _selectProject: function (projectId) {
            var node = this._projectsTree.get(projectId);
            if (! node) {
                return;
            }

            // Check for selection availability
            if (! this._currentFilteredProjects[ node.id ]) {
                return false;
            }

            // Select children
            var projectsIds =  Tree.nodeToArray(node, this._currentFilteredProjects);

            // Handle selection
            for (var i = 0, len = projectsIds.length; i <len; i++) {
                this._addSelectedProject(ProjectsMap.get(projectsIds[i]), projectsIds);
            }

            // Update selected projects
            this._setSelectedProjects(this._getSelectedProjects());
            this._ioApplyCurrentFilter(true);
            return true;
        },

        _unselectProject: function (projectId) {
            var node = this._selectedTree.get(projectId);
            if (! node) {
                return;
            }

            this._removeSelectedProject(node);
            this._setSelectedProjects(this._getSelectedProjects());
            this._ioApplyCurrentFilter(true);
            return true;
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         */
        _onProjectsLoaded: function (projects) {
            this._projectsTree = this._getProjectsTree(projects);
            this._currentFilteredProjects = this._projectsTree.index();
            this._ioRenderHiddenProjects(this._getProjectNodes(this._projectsTree.root).slice(1)/* Omit root project */);
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
})(window.Polymer || {}, window.Ajax, window._, window.Map);