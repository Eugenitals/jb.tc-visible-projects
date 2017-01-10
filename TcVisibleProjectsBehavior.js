/**
 @polymerBehavior Polymer.jb.TcVisibleProjectsBehavior
 */

"use strict";

(function (Polymer, Ajax, _) {
    var Errors = {
        COMMUNICATION_ERROR: _.template('Server "<%= url %>" returned status <%= status %>'),
        CAN_NOT_PARSE_RESPONSE: 'Error while parse response'
    };

    var Classes = {
        PROJECT: 'project-item',
        PROJECT_LEVEL: 'project-item__level'
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

        /** @type {Object} */
        _Classes: Classes,

        /** @type {Function} */
        _groupTemplate: null,

        /** @type {Array<Object>} */
        _projects: null,

        /** @type {Array<String>} */
        _projectNodes: null,

        /** @type {String} */
        _rootProjectId: null,

        _init: function (projectTemplate) {
            projectTemplate = projectTemplate || '${name}';
            this._groupTemplate = _.template([
                    '<div class="' + Classes.PROJECT + ' ' + Classes.PROJECT_LEVEL + '${_level}">',
                        projectTemplate,
                    '</div>'
                ].join(''),
                { escape: /\${([\s\S]+?)}/g }
            );
            this._projectNodes = [];
        },

        /**
         * @param rawProjects {Array<{ id:String, parentProjectId:String, name:String }>}
         * @private
         */
        _parseProjects: function (rawProjects) {
            var result = [];
            result._index = {};

            // Handle Root project
            var _project = rawProjects[0];
            _project._level = 0;
            _project._key = '';

            result.push(_project);
            result._index[_project.id] = _project;

            // Save root project ID
            this._rootProjectId = _project.id;

            for (var i = 1/* Omit root project */, len = rawProjects.length; i < len; i++ ) {
                _project = rawProjects[i];
                _project._level = result._index[_project.parentProjectId]._level + 1;
                _project._key = result._index[_project.parentProjectId]._key + '::' + _project.name.toLowerCase();

                result.push(_project);
                result._index[_project.id] = _project;
            }

            return result;
        },

        /**
         * @param filter {String}
         * @return {Array<Strings>} valid HTML strings elements
         * @private
         */
        _filterProjectsNodes: function (filter) {
            if (! this._projects.length) {
                return [];
            }

            var projects = this._projects.slice(1); // Omit root project
            var template = this._groupTemplate;
            var nodes = [];
            var _project;
            filter = filter.toLowerCase();

            for (var i = 0, len = projects.length; i < len; i++) {
                _project = projects[i];

                if (_project._key.indexOf(filter) !== -1) {
                    nodes.push(template(_project));
                }
            }

            return nodes;
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         * @private
         */
        _onProjectsLoaded: function (projects) {
            this._projects = this._parseProjects(projects);
            this._ioApplyCurrentFilter();
        },

        /**
         * @param error {Error}
         * @private
         */
        _onProjectsLoadError: function (error) {
            this._ioShowError(error.message);
        }
    };
})(window.Polymer || {}, window.Ajax, window._);