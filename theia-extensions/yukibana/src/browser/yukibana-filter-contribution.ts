/**
 * SPDX-License-Identifier: MIT
 */
import { ContributionFilterRegistry, Filter, FilterContribution } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';

const PROBLEM_CONTRIBUTIONS = [
    'ProblemContribution',
    'ProblemDecorationContribution',
    'ProblemManager',
    'ProblemWidget',
    'ProblemTabBarDecorator',
    'MarkerTreeLabelProvider',
    'ProblemWidgetTabBarDecorator',
    'ProblemAutoSaveContribution',
];

/**
 * Contribution to disable some contributions registered by other extensions (builtin or not)
 */
@injectable()
export class YukibanaFilterContribution implements FilterContribution {
    registerContributionFilters(registry: ContributionFilterRegistry): void {
        registry.addFilters('*', [
            // https://github.com/eclipse-theia/theia/blob/master/packages/terminal/src/browser/terminal-frontend-contribution.ts
            filterClassName(name => name !== 'TerminalFrontendContribution'),
            filterClassName(name => !PROBLEM_CONTRIBUTIONS.includes(name))
        ]);
    }
}

/**
 * Builds a filter function to filter contributions by their class names
 * @param filter Filter function taking in the name of a contribution
 * @returns Filter function applying the name filter on the contribution's class name
 */
function filterClassName(filter: Filter<string>): Filter<Object> {
    return object => {
        const className = object?.constructor?.name;
        return className ? filter(className) : false;
    };
}
