"use strict";

(function (Polymer) {
    var Errors = {
        COMMUNICATION_ERROR: _.template('Server "<%= url %>" returned status <%= status %>'),
        CAN_NOT_PARSE_RESPONSE: 'Error while parse response'
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

            this._uiSetLoading(true);

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
                    this._uiSetLoading(false);
                }
            });
        },

        /** @type {Function} */
        _groupTemplate: null,

        /** @type {Array<Object>} */
        _projects: null,

        /** @type {Array<String>} */
        _projectNodes: null,

        _init: function (projectTemplate) {
            this._groupTemplate = _.template(
                projectTemplate || '<div><%= name %></div>',
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
            this._projectNodes = this._getFilteredProjects(this._projects, this._uiGetFilter(), this._groupTemplate);
            this._uiShowProjectNodes(this._projectNodes);
        },

        /**
         * @param error {Error}
         * @private
         */
        _onProjectsLoadError: function (error) {
            this._uiShowError(error.message);
        }
    };
})(window.Polymer || {});