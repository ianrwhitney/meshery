---
layout: default
title: Meshery Adapter for Linkerd
name: Meshery Adapter for Linkerd
component: Linkerd
earliest_version: v2.10.2
port: 10001/gRPC
project_status: stable
lab: linkerd-meshery-adapter
github_link: https://github.com/meshery/meshery-linkerd
image: /assets/img/service-meshes/linkerd.svg
white_image: /assets/img/service-meshes/linkerd-white.svg
permalink: extensibility/adapters/linkerd
redirect_from: service-meshes/adapters/linkerd
language: en
---

{% assign sorted_tests_group = site.compatibility | group_by: "meshery-component" %}
{% for group in sorted_tests_group %}
      {% if group.name == "meshery-linkerd" %}
        {% assign items = group.items | sort: "meshery-component-version" | reverse %}
        {% for item in items %}
          {% if item.meshery-component-version != "edge" %}
            {% if item.overall-status == "passing" %}
              {% assign adapter_version_dynamic = item.meshery-component-version %}
              {% break %}
            {% elsif item.overall-status == "failing" %}
              {% continue %}
            {% endif %}
          {% endif %}
        {% endfor %} 
      {% endif %}
{% endfor %}

{% include compatibility/adapter-status.html %}



### Features

1. Lifecycle management of {{page.component}}
1. Lifecycle management of sample applications
1. Performance testing

## Lifecycle management

The {{page.name}} can install **{{page.earliest_version}}** of {{page.component}}. A number of sample applications can be installed using the {{page.name}}.

### Install {{ page.component }}

Note: Linkerd's control plane will be deployed to the `linkerd` namespace. Linkerd does not support deployments of its control plane into namespaces under a different name.

##### Choose the Meshery Adapter for {{ page.component }}

<a href="{{ site.baseurl }}/assets/img/adapters/linkerd/linkerd-adapter.png">
  <img style="width:500px;" src="{{ site.baseurl }}/assets/img/adapters/linkerd/linkerd-adapter.png" />
</a>

##### Click on (+) and choose the {{page.earliest_version}} of the {{page.component}}.

<a href="{{ site.baseurl }}/assets/img/adapters/linkerd/linkerd-install.png">
  <img style="width:500px;" src="{{ site.baseurl }}/assets/img/adapters/linkerd/linkerd-install.png" />
</a>

### Sample Applications

The {{ page.name }} includes the ability to deploy a variety of sample applications. Use Meshery to deploy any of these sample applications:

- [Emojivoto]({{site.baseurl}}/guides/infrastructure-management/sample-apps)

  - A microservice application that allows users to vote for their favorite emoji, and tracks votes received on a leaderboard.

- [Bookinfo]({{site.baseurl}}/guides/infrastructure-management/sample-apps)

  - The sample BookInfo application displays information about a book, similar to a single catalog entry of an online book store.

- [Linkerd Books]({{site.baseurl}}/guides/infrastructure-management/sample-apps)

  - A sample application built for demonstrating manage your bookshelf.

- [HTTPbin]({{site.baseurl}}/guides/infrastructure-management/sample-apps)
  - A simple HTTP Request & Response Service.

Identify overhead involved in running {{page.component}}, various {{page.component}} configurations while running different workloads and on different infrastructure. The adapter facilitates data plane and control plane performance testing.

1. Prometheus integration
1. Grafana integration

The [Meshery Adapter for Linkerd]({{ page.github_link }}) will connect to Linkerd's Prometheus and Grafana instances running in the control plane.
