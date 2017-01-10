"use strict";

(function (Polymer) {
    var Errors = {
        COMMUNICATION_ERROR: _.template('Server "<%= url %>" returned status <%= status %>'),
        CAN_NOT_PARSE_RESPONSE: 'Error while parse response'
    };

    var Classes = {
        PROJECT: 'project-item'
    };

    Polymer.jb = Polymer.jb || {};
    Polymer.jb.TcVisibleProjectsBehavior = {
        /**
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

        /** @type {Function} */
        _groupTemplate: null,

        /** @type {Array<Object>} */
        _projects: null,

        /** @type {Array<String>} */
        _projectNodes: null,

        /** @type {Object} */
        _Classes: Classes,

        _init: function (projectTemplate) {
            projectTemplate = projectTemplate || '${name}';
            this._groupTemplate = _.template([
                    '<div class="' + Classes.PROJECT + '">',
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
            return rawProjects.map(function (_project) {
                _project.__key = _project.name.toLowerCase();
                return _project;
            });
        },

        _getFilteredProjects: function (projects, filter, template) {
            var result = [];

            if (! projects.length) {
                return result;
            }

            // Remove Root project
            projects.shift();
            filter = filter.toLowerCase();
            projects.forEach(function (_project) {
                if (_project.__key.indexOf(filter) !== -1) {
                    result.push(template(_project));
                }
            });

            return result;
        },

        /**
         * @param result {{count: Number, href: String, project: Array}}
         * @private
         */
        _onProjectsLoaded: function (projects) {
            this._projects = this._parseProjects(projects);
            this._projectNodes = this._getFilteredProjects(this._projects, this._ioGetFilter(), this._groupTemplate);
            this._ioShowProjectNodes(this._projectNodes);
        },

        /**
         * @param error {Error}
         * @private
         */
        _onProjectsLoadError: function (error) {
            this._ioShowError(error.message);
        }
    };
})(window.Polymer || {});