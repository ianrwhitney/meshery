import {
  Box,
  Card,
  CardActions,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  Table,
  Tooltip,
  styled,
  FormLabel,
  TableBody,
  TableCell,
  TableRow,
  NoSsr,
  TableHead,
} from '@layer5/sistent';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayIcon from '@mui/icons-material/PlayArrow';
import MUIDataTable from 'mui-datatables';
import { withRouter } from 'next/router';
import PropTypes from 'prop-types';
import React from 'react';
import { Controlled as CodeMirror } from 'react-codemirror2';
import Moment from 'react-moment';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import dataFetch from '../lib/data-fetch';
import { setK8sContexts, updateProgress, actionTypes } from '../lib/store';
import { ctxUrl, getK8sClusterIdsFromCtxId } from '../utils/multi-ctx';
import fetchAvailableAddons from './graphql/queries/AddonsStatusQuery';
import fetchAvailableNamespaces from './graphql/queries/NamespaceQuery';
import MesheryMetrics from './MesheryMetrics';
import MesheryResultDialog from './MesheryResultDialog';
import ReactSelectWrapper from './ReactSelectWrapper';
import ConfirmationMsg from './ConfirmationModal';
import { iconMedium } from '../css/icons.styles';
import { ACTIONS } from '../utils/Enum';
import { getModelByName } from '../api/meshmodel';
import { EVENT_TYPES } from '../lib/event-types';
import { withNotify } from '../utils/hooks/useNotification';
import { keys } from '@/utils/permission_constants';
import CAN from '@/utils/can';

export const AdapterChip = styled(Chip)(({ theme }) => ({
  height: '50px',
  fontSize: '15px',
  position: 'relative',
  top: theme.spacing(0.5),
  [theme.breakpoints.down('md')]: {
    fontSize: '12px',
  },
}));

const AdapterTableHeader = styled(TableCell)({
  fontWeight: 'bolder',
  fontSize: 18,
});

const AdapterSmWrapper = styled('div')(({ theme }) => ({
  backgroundColor: theme.palette.background.card,
}));

const SecondaryTable = styled('div')({
  borderRadius: 10,
  backgroundColor: '#f7f7f7',
});

const PaneSection = styled('div')(({ theme }) => ({
  backgroundColor: theme.palette.background.tabs,
  padding: theme.spacing(3),
  borderRadius: 4,
}));

const ChipNamespaceContainer = styled(Grid)(() => ({
  gap: '2rem',
  margin: '0px',
}));

const CardMeshContainer = styled(Grid)(() => ({
  margin: '-8px 0px',
}));

const InputWrapper = styled('div')(() => ({
  flex: '1',
  minWidth: '250px',
}));

const AdapterCard = styled(Card)(() => ({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
}));

class MesheryAdapterPlayComponent extends React.Component {
  constructor(props) {
    super(props);

    this.cmEditorAdd = null;
    this.cmEditorDel = null;

    const { adapter } = props;

    const menuState = {};

    this.addIconEles = {};
    this.delIconEles = {};
    // initializing menuState;
    if (adapter && adapter.ops) {
      // NOTE: this will have to updated to match the categories
      [0, 1, 2, 3, 4].forEach((i) => {
        menuState[i] = {
          add: false,
          delete: false,
        };
      });
    }

    this.activeMesh = adapter.name;

    this.modalRef = React.createRef();

    this.state = {
      cmEditorValAdd: '',
      cmEditorValAddError: false,

      cmEditorValDel: '',
      cmEditorValDelError: false,

      selectionError: false,

      namespace: {
        value: 'default',
        label: 'default',
      },
      namespaceError: false,

      customDialogAdd: false,
      customDialogDel: false,
      customDialogSMI: false,

      open: false,

      menuState, // category: {add: 1, delete: 0}

      addonSwitchGroup: {},

      smi_result: [],
      selectedRowData: null,
      page: 0,
      search: '',
      sortOrder: '',
      pageSize: 10,
      namespaceList: [],
      namespaceSubscription: null,
      activeContexts: [],
      deployModalOpen: false,
      category: 0,
      selectedOp: '',
      isDeleteOp: false,
      operationName: '',
      versionList: [],
      version: {
        labeL: '',
        value: '',
      },
      versionError: false,
    };
  }

  initSubscription = () => {
    const self = this;

    const namespaceSubscription = fetchAvailableNamespaces({
      k8sClusterIDs: self.getK8sClusterIds(),
    }).subscribe({
      next: (res) => {
        let namespaces = [];
        res?.namespaces?.map((ns) => {
          namespaces.push({
            value: ns?.namespace,
            label: ns?.namespace,
          });
        });
        if (namespaces.length === 0) {
          namespaces.push({
            value: 'default',
            label: 'default',
          });
        }
        namespaces.sort((a, b) => (a.value > b.value ? 1 : -1));
        self.setState({ namespaceList: namespaces });
      },
      error: (err) => console.log('error at namespace fetch: ' + err),
    });

    this.setState({ namespaceSubscription });
  };

  disposeSubscriptions = () => {
    if (this.state.namespaceSubscription) {
      this.state.namespaceSubscription.unsubscribe();
    }
  };

  componentDidMount() {
    const self = this;
    const meshname = self.mapAdapterNameToMeshName(self.activeMesh);
    const variables = { type: meshname, k8sClusterIDs: this.getK8sClusterIds() };
    this.initSubscription();
    this.getMeshVersions();
    if (this.props.selectedK8sContexts) {
      if (this.props.selectedK8sContexts.includes('all')) {
        let active = [];
        this.props.k8sconfig.forEach((ctx) => {
          active.push(ctx.contextID);
        });
        this.setState({ activeContexts: active });
      } else {
        this.setState({ activeContexts: this.props.selectedK8sContexts });
      }
    }

    fetchAvailableAddons(variables).subscribe({
      next: (res) => {
        self.setAddonsState(res);
      },
      error: (err) => console.log('error at addon fetch: ' + err),
    });
  }

  // static getDerivedStateFromProps(props, state) {
  //   if (props.selectedK8sContexts.length !== state.activeContexts) {
  //     if (props.selectedK8sContexts[0] === 'all') {
  //       state.activeContexts = props.k8sconfig;
  //       return state;
  //     } else {
  //       let active = [];
  //       props.k8sconfig.forEach((ctx) => {
  //         if (props.selectedK8sContexts.includes(ctx.contextID)) {
  //           active.push(ctx);
  //         }
  //       })
  //     state.activeContexts = active;
  //     return state;
  //     }
  //   }
  // }

  handleContexts() {}

  getMeshVersions() {
    const activeMesh = this.props?.adapter.name;
    getModelByName(activeMesh.toLowerCase()).then((res) => {
      let uniqueVersions = [...new Set(res?.models?.map((model) => model?.version))].reverse();
      if (uniqueVersions.length === 0) {
        uniqueVersions = [''];
      }
      let versionList = uniqueVersions.map((version) => ({ value: version, label: version }));
      this.setState({
        versionList: versionList,
        version: versionList[0],
      });
    });
  }

  componentDidUpdate(prevProps) {
    if (prevProps?.selectedK8sContexts.length !== this.props?.selectedK8sContexts.length) {
      this.disposeSubscriptions();
      this.initSubscription();
    }
    if (prevProps?.adapter.name !== this.props?.adapter.name) {
      this.getMeshVersions();
    }
  }

  getK8sClusterIds = () => {
    return getK8sClusterIdsFromCtxId(this.props?.selectedK8sContexts, this.props.k8sconfig);
  };

  mapAdapterNameToMeshName(name) {
    if (name?.toLowerCase() === 'istio') return 'ISTIO';

    return 'ALL';
  }

  setAddonsState = (data) => {
    const self = this;
    const meshname = self.activeMesh;
    const localState = {};
    data?.addonsState?.forEach((addon) => {
      if (addon.owner === meshname) {
        const name = addon.name !== 'jaeger-collector' ? addon.name : 'jaeger';
        localState[`${name}-addon`] = true;
      }
    });
    self.setState(() => {
      return { addonSwitchGroup: localState };
    });
  };

  handleChange = (name, isDelete = false) => {
    const self = this;
    return (event) => {
      if (name === 'selectedOp' && event.target.value !== '') {
        if (event.target.value === 'custom') {
          if (isDelete) {
            if (
              self.state.cmEditorValDel !== '' &&
              self.cmEditorDel.state.lint.marked.length === 0
            ) {
              self.setState({ selectionError: false, cmEditorValDelError: false });
            }
          } else if (
            self.state.cmEditorValAdd !== '' &&
            self.cmEditorAdd.state.lint.marked.length === 0
          ) {
            self.setState({ selectionError: false, cmEditorValAddError: false });
          }
        } else {
          self.setState({ selectionError: false });
        }
      }

      self.setState({ [name]: event.target.value });
    };
  };

  handleNamespaceChange = (newValue) => {
    if (typeof newValue !== 'undefined') {
      this.setState({ namespace: newValue, namespaceError: false });
    } else {
      this.setState({ namespaceError: true });
    }
  };

  handleVersionChange = (newValue) => {
    if (typeof newValue !== 'undefined') {
      this.setState({ version: newValue, namespaceError: false });
    } else {
      this.setState({ versionError: true });
    }
  };

  handleModalClose(isDelete) {
    const self = this;
    return () => {
      const item = isDelete ? 'customDialogDel' : 'customDialogAdd';
      self.setState({ [item]: false });
    };
  }

  handleSMIClose() {
    const self = this;
    return () => {
      self.setState({ ['customDialogSMI']: false });
    };
  }

  resetSelectedRowData() {
    const self = this;
    return () => {
      self.setState({ selectedRowData: null });
    };
  }

  handleModalOpen(isDelete) {
    const self = this;
    return () => {
      const item = isDelete ? 'customDialogDel' : 'customDialogAdd';
      self.setState({ [item]: true });
    };
  }

  handleSubmit = (cat, selectedOp, deleteOp = false) => {
    const self = this;
    return () => {
      self.handleOpen();
      const { namespace, cmEditorValAdd, cmEditorValDel, version } = self.state;
      const { adapter } = self.props;
      const filteredOp = adapter.ops.filter(({ key }) => key === selectedOp);
      if (selectedOp === '' || typeof filteredOp === 'undefined' || filteredOp.length === 0) {
        self.setState({ selectionError: true });
        return;
      }
      if (deleteOp) {
        if (
          selectedOp === 'custom' &&
          (cmEditorValDel === '' || self.cmEditorDel.state.lint.marked.length > 0)
        ) {
          self.setState({ cmEditorValDelError: true, selectionError: true });
          return;
        }
      } else if (
        selectedOp === 'custom' &&
        (cmEditorValAdd === '' || self.cmEditorAdd.state.lint.marked.length > 0)
      ) {
        self.setState({ cmEditorValAddError: true, selectionError: true });
        return;
      }
      if (namespace.value === '') {
        self.setState({ namespaceError: true });
        return;
      }

      if (version?.value === '') {
        self.setState({ versionError: true });
        return;
      }
      const operationName = selectedOp
        .replaceAll('_', ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      self.setState({
        category: cat,
        selectedOp: selectedOp,
        isDeleteOp: deleteOp,
        operationName: operationName,
      });

      // let response = await this.showModal()
      // if (response === "DEPLOY") {
      //   this.submitOp(cat, selectedOp, deleteOp)
      // }
      // self.submitOp(cat, selectedOp, deleteOp);
    };
  };

  submitOp = (cat, selectedOp, deleteOp = false) => {
    const { namespace, cmEditorValAdd, cmEditorValDel, menuState, version } = this.state;
    const { adapter } = this.props;
    // const fileInput = document.querySelector('#k8sfile') ;
    const data = {
      adapter: adapter.adapter_location,
      query: selectedOp,
      namespace: namespace.value,
      customBody: deleteOp ? cmEditorValDel : cmEditorValAdd,
      deleteOp: deleteOp ? 'on' : '',
      version: version.value,
    };

    const params = Object.keys(data)
      .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
      .join('&');
    this.props.updateProgress({ showProgress: true });
    this.handleClose();
    const self = this;
    dataFetch(
      ctxUrl('/api/system/adapter/operation', this.props.selectedK8sContexts),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: params,
      },
      (result) => {
        self.props.updateProgress({ showProgress: false });
        menuState[cat][deleteOp ? 'delete' : 'add'] = false;
        const dlg = deleteOp ? 'customDialogDel' : 'customDialogAdd';
        self.setState({ menuState, [dlg]: false });

        if (typeof result !== 'undefined') {
          const notify = self.props.notify;
          notify({ message: 'Operation executing...', event_type: EVENT_TYPES.INFO });
        }
      },
      self.handleError(cat, deleteOp, selectedOp),
    );
  };

  handleAdapterClick = (adapterLoc) => () => {
    this.props.updateProgress({ showProgress: true });
    const self = this;
    dataFetch(
      `/api/system/adapters?adapter=${encodeURIComponent(adapterLoc)}`,
      {
        credentials: 'include',
      },
      (result) => {
        this.props.updateProgress({ showProgress: false });
        if (typeof result !== 'undefined') {
          const notify = self.props.notify;
          notify({ message: 'Adapter pinged!', event_type: EVENT_TYPES.SUCCESS });
        }
      },
      self.handleError('Could not ping adapter.'),
    );
  };

  fetchSMIResults = (adapterName, page, pageSize, search, sortOrder) => {
    const self = this;
    let query = '';
    if (typeof search === 'undefined' || search === null) {
      search = '';
    }
    if (typeof sortOrder === 'undefined' || sortOrder === null) {
      sortOrder = '';
    }
    query = `?page=${page}&pagesize=${pageSize}&search=${encodeURIComponent(
      search,
    )}&order=${encodeURIComponent(sortOrder)}`;

    dataFetch(
      `/api/smi/results${query}`,
      {
        method: 'GET',
        credentials: 'include',
      },
      (result) => {
        if (typeof result !== 'undefined' && result.results) {
          const results = result.results.filter(
            (val) => val.mesh_name.toLowerCase() == adapterName.toLowerCase(),
          );
          self.setState({
            smi_result: { ...result, results: results, total_count: results.length },
          });
        }
      },
      (error) => console.log('Could not fetch SMI results.', error),
    );
  };

  handleSMIClick = (adapterName) => () => {
    this.props.updateProgress({ showProgress: true });
    const self = this;
    const { page, pageSize, search, sortOrder } = self.state;
    self.fetchSMIResults(adapterName, page, pageSize, search, sortOrder);
    this.props.updateProgress({ showProgress: false });
    self.setState({ ['customDialogSMI']: true });
  };

  handleError = (cat, deleteOp, selectedOp) => {
    const self = this;
    return (error) => {
      if (cat && deleteOp) {
        const { menuState } = self.state;
        menuState[cat][deleteOp ? 'delete' : 'add'] = false;
        const dlg = deleteOp ? 'customDialogDel' : 'customDialogAdd';
        self.setState({ menuState, [dlg]: false });
      }
      self.setState({ addonSwitchGroup: { ...self.addonSwitchGroup, [selectedOp]: deleteOp } });
      self.props.updateProgress({ showProgress: false });
      const notify = self.props.notify;
      notify({
        message: `Operation submission failed: ${error}`,
        event_type: EVENT_TYPES.ERROR,
        details: error.toString(),
      });
    };
  };

  handleExpandClick() {
    // setExpanded(!expanded);
  }

  handleDeployModalOpen = () => {
    this.setState({ deployModalOpen: true });
  };

  handleDeployModalClose = () => {
    this.setState({ deployModalOpen: false });
  };

  /**
   * Sets the selected k8s context on global level.
   * @param {Array.<string>} activeK8sContexts
   */
  activeContextChangeCallback = (activeK8sContexts) => {
    if (activeK8sContexts.includes('all')) {
      activeK8sContexts = ['all'];
    }
    this.props.setK8sContexts({
      type: actionTypes.SET_K8S_CONTEXT,
      selectedK8sContexts: activeK8sContexts,
    });
  };

  /**
   * generateMenu generates the management menus for the adapater management plane
   * @param {*} cat
   * @param {boolean} isDelete if set to true, a delete menu will be generated
   * @param {{key: string, value: string, category?: number}[]} selectedAdapterOps is the array of the meshery adapaters
   *
   * @returns {JSX.Element}
   */
  generateMenu(cat, isDelete, selectedAdapterOps) {
    const { menuState } = this.state;
    const ele = !isDelete ? this.addIconEles[cat] : this.delIconEles[cat];
    return (
      <Menu
        id="long-menu"
        anchorEl={ele}
        keepMounted
        open={menuState[cat][isDelete ? 'delete' : 'add']}
        onClose={this.addDelHandleClick(cat, isDelete)}
      >
        {selectedAdapterOps
          .sort((adap1, adap2) => adap1.value.localeCompare(adap2.value))
          .map(({ key, value }) => (
            <MenuItem
              key={`${key}_${new Date().getTime()}`}
              onClick={this.handleSubmit(cat, key, isDelete)}
            >
              {value}
            </MenuItem>
          ))}
      </Menu>
    );
  }

  handleOpen = () => {
    this.setState({ modalOpen: true });
  };

  handleClose = () => {
    this.setState({ modalOpen: false });
  };

  generateSMIResult() {
    const self = this;

    const { customDialogSMI, smi_result, pageSize } = self.state;

    const { user } = self.props;

    const smi_columns = [
      {
        name: 'ID',
        label: 'ID',
        options: {
          filter: true,
          sort: true,
          searchable: true,
          customHeadRender: ({ index, ...column }) => {
            return (
              <TableCell key={index}>
                <b>{column.label}</b>
              </TableCell>
            );
          },
          customBodyRender: (value) => (
            <Tooltip title={value} placement="top">
              <div>{value.slice(0, 5) + '...'}</div>
            </Tooltip>
          ),
        },
      },
      {
        name: 'Date',
        label: 'Date',
        options: {
          filter: true,
          sort: true,
          searchable: true,
          customHeadRender: ({ index, ...column }) => {
            return (
              <TableCell key={index}>
                <b>{column.label}</b>
              </TableCell>
            );
          },
          customBodyRender: (value) => <Moment format="LLLL">{value}</Moment>,
        },
      },
      {
        name: 'Service Mesh',
        label: 'Service Mesh',
        options: {
          filter: true,
          sort: true,
          searchable: true,
          customHeadRender: ({ index, ...column }) => {
            return (
              <TableCell key={index}>
                <b>{column.label}</b>
              </TableCell>
            );
          },
        },
      },
      {
        name: 'Service Mesh Version',
        label: 'Service Mesh Version',
        options: {
          filter: true,
          sort: true,
          searchable: true,
          customHeadRender: ({ index, ...column }) => {
            return (
              <TableCell key={index}>
                <b>{column.label}</b>
              </TableCell>
            );
          },
        },
      },
      {
        name: '% Passed',
        label: '% Passed',
        options: {
          filter: true,
          sort: true,
          searchable: true,
          customHeadRender: ({ index, ...column }) => {
            return (
              <TableCell key={index}>
                <b>{column.label}</b>
              </TableCell>
            );
          },
        },
      },
      {
        name: 'status',
        label: 'Status',
        options: {
          filter: true,
          sort: true,
          searchable: true,
          customHeadRender: ({ index, ...column }) => {
            return (
              <TableCell key={index}>
                <b>{column.label}</b>
              </TableCell>
            );
          },
        },
      },
    ];

    const smi_options = {
      sort: !(user && user.user_id === 'meshery'),
      search: !(user && user.user_id === 'meshery'),
      filterType: 'textField',
      expandableRows: true,
      selectableRows: 'none',
      rowsPerPage: pageSize,
      rowsPerPageOptions: [10, 20, 25],
      fixedHeader: true,
      print: false,
      download: false,
      renderExpandableRow: (rowData, rowMeta) => {
        const column = [
          'Specification',
          'Assertions',
          'Time',
          'Version',
          'Capability',
          'Result',
          'Reason',
        ];
        const data = smi_result.results[rowMeta.dataIndex].more_details.map((val) => {
          return [
            val.smi_specification,
            val.assertions,
            val.time,
            val.smi_version,
            val.capability,
            val.status,
            val.reason,
          ];
        });
        const colSpan = rowData.length + 1;
        return (
          <TableRow>
            <TableCell colSpan={colSpan}>
              <SecondaryTable>
                <Table aria-label="a dense table">
                  <TableHead>
                    <TableRow>
                      {column.map((val) => (
                        <TableCell colSpan={colSpan} key={val}>
                          {val}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.map((row) => (
                      <TableRow key={row?.uniqueID}>
                        {row.map((val) => {
                          if (val && val.match(/[0-9]+m[0-9]+.+[0-9]+s/i) != null) {
                            const time = val.split(/m|s/);
                            return (
                              <TableCell colSpan={colSpan} key={val}>
                                {time[0] + 'm ' + parseFloat(time[1]).toFixed(1) + 's'}
                              </TableCell>
                            );
                          } else {
                            return (
                              <TableCell colSpan={colSpan} key={val}>
                                {val}
                              </TableCell>
                            );
                          }
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SecondaryTable>
            </TableCell>
          </TableRow>
        );
      },
      onTableChange: (action, tableState) => {
        const sortInfo = tableState.announceText ? tableState.announceText.split(' : ') : [];
        let order = '';
        if (tableState.activeColumn) {
          order = `${smi_columns[tableState.activeColumn].name} desc`;
        }

        switch (action) {
          case 'changePage':
            self.fetchSMIResults(
              self.props.adapter.name,
              tableState.page,
              self.state.pageSize,
              self.state.search,
              self.state.sortOrder,
            );
            break;
          case 'changeRowsPerPage':
            self.fetchSMIResults(
              self.props.adapter.name,
              self.state.page,
              tableState.rowsPerPage,
              self.state.search,
              self.state.sortOrder,
            );
            break;
          case 'search':
            if (self.searchTimeout) {
              clearTimeout(self.searchTimeout);
            }
            self.searchTimeout = setTimeout(() => {
              if (self.state.search !== tableState.searchText) {
                self.fetchSMIResults(
                  self.props.adapter.name,
                  self.state.page,
                  self.state.pageSize,
                  tableState.searchText !== null ? tableState.searchText : '',
                  self.state.sortOrder,
                );
              }
            }, 500);
            break;
          case 'sort':
            if (sortInfo.length === 2) {
              if (sortInfo[1] === 'ascending') {
                order = `${smi_columns[tableState.activeColumn].name} asc`;
              } else {
                order = `${smi_columns[tableState.activeColumn].name} desc`;
              }
            }
            if (order !== this.state.sortOrder) {
              self.fetchSMIResults(
                self.props.adapter.name,
                self.state.page,
                self.state.pageSize,
                self.state.search,
                order,
              );
            }
            break;
        }
      },
    };

    var data = [];
    if (smi_result && smi_result.results) {
      data = smi_result.results.map((val) => {
        return [
          val.id,
          val.date,
          val.mesh_name,
          val.mesh_version,
          val.passing_percentage,
          val.status,
        ];
      });
    }

    return (
      <Dialog
        onClose={this.handleSMIClose()}
        aria-labelledby="adapter-dialog-title"
        open={customDialogSMI}
        fullWidth
        maxWidth="md"
      >
        <MUIDataTable
          title={
            <AdapterTableHeader>Service Mesh Interface Conformance Results</AdapterTableHeader>
          }
          data={data}
          columns={smi_columns}
          options={smi_options}
        />
      </Dialog>
    );
  }

  generateYAMLEditor(cat, isDelete) {
    const { adapter } = this.props;
    const {
      customDialogAdd,
      customDialogDel,
      namespace,
      namespaceError,
      cmEditorValAdd,
      cmEditorValDel,
      namespaceList,
      versionList,
      version,
      versionError,
    } = this.state;
    const self = this;
    return (
      <Dialog
        onClose={this.handleModalClose(isDelete)}
        aria-labelledby="adapter-dialog-title"
        open={isDelete ? customDialogDel : customDialogAdd}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle id="adapter-dialog-title" onClose={this.handleModalClose(isDelete)}>
          {adapter.name} Adapter - Custom YAML
          {isDelete ? '(delete)' : ''}
        </DialogTitle>
        <Divider variant="fullWidth" light />
        <DialogContent>
          <Grid container spacing={5}>
            <Grid item xs={6}>
              <ReactSelectWrapper
                label="Namespace"
                value={namespace}
                error={namespaceError}
                options={namespaceList}
                onChange={this.handleNamespaceChange}
              />
            </Grid>
            <Grid item xs={6}>
              <ReactSelectWrapper
                label="Version"
                value={version}
                error={versionError}
                options={versionList}
                onChange={this.handleVersionChange}
              />
            </Grid>
            <Grid item xs={12}>
              <CodeMirror
                editorDidMount={(editor) => {
                  if (isDelete) {
                    self.cmEditorDel = editor;
                  } else {
                    self.cmEditorAdd = editor;
                  }
                }}
                value={isDelete ? cmEditorValDel : cmEditorValAdd}
                options={{
                  theme: 'material',
                  lineNumbers: true,
                  lineWrapping: true,
                  gutters: ['CodeMirror-lint-markers'],
                  lint: true,
                  mode: 'text/x-yaml',
                }}
                onBeforeChange={(editor, data, value) => {
                  if (isDelete) {
                    self.setState({ cmEditorValDel: value });
                  } else {
                    self.setState({ cmEditorValAdd: value });
                  }
                  if (isDelete) {
                    if (value !== '' && self.cmEditorDel.state.lint.marked.length === 0) {
                      self.setState({ selectionError: false, cmEditorValDelError: false });
                    }
                  } else if (value !== '' && self.cmEditorAdd.state.lint.marked.length === 0) {
                    self.setState({ selectionError: false, cmEditorValAddError: false });
                  }
                }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <Divider variant="fullWidth" light />
        <DialogActions>
          <IconButton aria-label="Apply" onClick={this.handleSubmit(cat, 'custom', isDelete)}>
            {/* <FontAwesomeIcon icon={faArrowRight} transform="shrink-4" fixedWidth /> */}
            {!isDelete && <PlayIcon style={iconMedium} />}
            {isDelete && <DeleteIcon style={iconMedium} />}
          </IconButton>
        </DialogActions>
      </Dialog>
    );
  }

  addDelHandleClick = (cat, isDelete) => {
    const self = this;
    return () => {
      const { menuState, customDialogAdd, customDialogDel } = self.state;
      menuState[cat][isDelete ? 'delete' : 'add'] = !menuState[cat][isDelete ? 'delete' : 'add'];

      const dlg = isDelete ? 'customDialogDel' : 'customDialogAdd';
      let dlgv = isDelete ? customDialogDel : customDialogAdd;
      if (cat === 4) {
        dlgv = !dlgv;
      }
      self.setState({ menuState, [dlg]: dlgv });
    };
  };

  generateCardForCategory(cat) {
    if (typeof cat === 'undefined') {
      cat = 0;
    }
    const { adapter } = this.props;
    // const expanded = false;

    let selectedAdapterOps =
      adapter && adapter.ops
        ? adapter.ops.filter(
            ({ category }) => (typeof category === 'undefined' && cat === 0) || category === cat,
          )
        : [];
    let content;
    let description;
    let permission;
    switch (cat) {
      case 0:
        content = 'Manage Cloud Native Infrastructure Lifecycle';
        description = 'Deploy cloud native infrastructure or SMI adapter on your cluster.';
        permission = {
          action: keys.MANAGE_CLOUD_NATIVE_INFRASTRUCTURE_LIFE_CYCLE.action,
          subject: keys.MANAGE_CLOUD_NATIVE_INFRASTRUCTURE_LIFE_CYCLE.subject,
        };
        break;

      case 1:
        content = 'Manage Sample Application Lifecycle';
        description = 'Deploy sample applications on/off the service mesh.';
        permission = {
          action: keys.MANAGE_CLOUD_NATIVE_INFRASTRUCTURE_LIFE_CYCLE.action,
          subject: keys.MANAGE_CLOUD_NATIVE_INFRASTRUCTURE_LIFE_CYCLE.subject,
        };
        break;

      case 2:
        content = 'Apply Cloud Native Infrastructure Configuration';
        description = 'Configure your cloud native infrastructure using some pre-defined options.';
        selectedAdapterOps = selectedAdapterOps.filter((ops) => !ops.value.startsWith('Add-on:'));
        permission = {
          action: keys.APPLY_CLOUD_NATIVE_INFRASTRUCTURE_CONFIGURATION.action,
          subject: keys.APPLY_CLOUD_NATIVE_INFRASTRUCTURE_CONFIGURATION.subject,
        };
        break;

      case 3:
        content = 'Validate Cloud Native Infrastructure Configuration';
        description =
          'Validate your cloud native infrastructure configuration against best practices.';
        permission = {
          action: keys.VALIDATE_CLOUD_NATIVE_INFRASTRUCTURE_CONFIGURATION.action,
          subject: keys.VALIDATE_CLOUD_NATIVE_INFRASTRUCTURE_CONFIGURATION.subject,
        };
        break;

      case 4:
        content = 'Apply Custom Configuration';
        description = 'Customize the configuration of your cloud native infrastructure.';
        permission = {
          action: keys.APPLY_CUSTOM_CLOUD_NATIVE_CONFIGURATION.action,
          subject: keys.APPLY_CUSTOM_CLOUD_NATIVE_CONFIGURATION.subject,
        };
        break;
    }
    return (
      <AdapterCard>
        <CardHeader title={content} subheader={description} style={{ flexGrow: 1 }} />
        <CardActions disableSpacing>
          <IconButton
            aria-label="install"
            ref={(ch) => (this.addIconEles[cat] = ch)}
            onClick={this.addDelHandleClick(cat, false)}
            disabled={!CAN(permission.action, permission.subject)}
          >
            {cat !== 4 ? <AddIcon style={iconMedium} /> : <PlayIcon style={iconMedium} />}
          </IconButton>
          {cat !== 4 && this.generateMenu(cat, false, selectedAdapterOps)}
          {cat === 4 && this.generateYAMLEditor(cat, false)}
          {cat !== 3 && (
            <Box width={'100%'}>
              <IconButton
                aria-label="delete"
                ref={(ch) => (this.delIconEles[cat] = ch)}
                style={{ float: 'right' }}
                onClick={this.addDelHandleClick(cat, true)}
                disabled={!CAN(permission.action, permission.subject)}
              >
                <DeleteIcon style={iconMedium} />
              </IconButton>
              {cat !== 4 && this.generateMenu(cat, true, selectedAdapterOps)}
              {cat === 4 && this.generateYAMLEditor(cat, true)}
            </Box>
          )}
        </CardActions>
      </AdapterCard>
    );
  }

  /**
   * extractAddonOperations returns an array of operations
   * which have a prefix "Addon:"
   * @param {number} addonOpsCat category for addon operations
   * @returns {{category: number, key: string, value: string}[]}
   */
  extractAddonOperations(addonOpsCat) {
    return this.props.adapter.ops.filter(
      ({ category, value }) => category === addonOpsCat && value?.startsWith('Add-on:'),
    );
  }

  /**
   * generateAddonSwitches creates a switch based ui for the addon operations
   * @param {{category: number, key: string, value: string}[]} selectedAdapterOps available adapter operations
   * @returns {JSX.Element}
   */
  generateAddonSwitches(selectedAdapterOps) {
    if (!selectedAdapterOps.length) return null;

    const self = this.state;
    return (
      <FormControl component="fieldset" style={{ padding: '1rem' }}>
        <FormLabel component="legend">Customize Addons</FormLabel>
        <FormGroup>
          {selectedAdapterOps
            .map((ops) => ({ ...ops, value: ops.value.replace('Add-on:', '') }))
            .sort((ops1, ops2) => ops1.value.localeCompare(ops2.value))
            .map((ops) => (
              <FormControlLabel
                control={
                  <Switch
                    color="primary"
                    checked={!!self.addonSwitchGroup[ops.key]}
                    onChange={(ev) => {
                      this.setState(
                        {
                          addonSwitchGroup: {
                            ...self.addonSwitchGroup,
                            [ev.target.name]: ev.target.checked,
                          },
                        },
                        () => {
                          this.submitOp(ops.category, ops.key, !!self.addonSwitchGroup[ops.key]);
                        },
                      );
                    }}
                    name={ops.key}
                  />
                }
                label={ops.value}
                key={ops.key}
              />
            ))}
        </FormGroup>
      </FormControl>
    );
  }

  /**
   * renderGrafanaCustomCharts takes in the configuration and renders
   * the grafana boards. If the configuration is empty then it renders
   * a note directing a user to install grafana and prometheus
   * @param {Array<{ board: any, panels: Array<any>, templateVars: Array<any>}>} boardConfigs grafana board configs
   * @param {string} grafanaURL grafana URL
   * @param {string} grafanaAPIKey grafana API key
   */
  renderGrafanaCustomCharts(boardConfigs, grafanaURL, grafanaAPIKey) {
    return (
      <MesheryMetrics
        boardConfigs={boardConfigs}
        grafanaAPIKey={grafanaAPIKey}
        grafanaURL={grafanaURL}
        handleGrafanaChartAddition={() =>
          this.props.router.push('/settings?settingsCategory=Metrics')
        }
      />
    );
  }

  render() {
    const { adapter } = this.props;
    const {
      namespace,
      namespaceError,
      selectedRowData,
      namespaceList,
      version,
      versionList,
      versionError,
    } = this.state;
    let adapterName = adapter.name.split(' ').join('').toLowerCase();
    let imageSrc = '/static/img/' + adapterName + '.svg';
    let adapterChip = (
      <AdapterChip
        label={adapter.adapter_location}
        data-cy="adapter-chip-ping"
        onClick={this.handleAdapterClick(adapter.adapter_location)}
        icon={<img src={imageSrc} width={'1.25rem'} />}
        variant="outlined"
      />
    );

    const filteredOps = [];
    if (adapter && adapter.ops && adapter.ops.length > 0) {
      adapter.ops.forEach(({ category }) => {
        if (typeof category === 'undefined') {
          category = 0;
        }
        if (filteredOps.indexOf(category) === -1) {
          filteredOps.push(category);
        }
      });
      filteredOps.sort();
    }
    return (
      <NoSsr>
        {selectedRowData && selectedRowData !== null && Object.keys(selectedRowData).length > 0 && (
          <MesheryResultDialog rowData={selectedRowData} close={self.resetSelectedRowData()} />
        )}
        <React.Fragment>
          <AdapterSmWrapper>
            <Grid container spacing={2} direction="row" alignItems="flex-start">
              {/* SECTION 1 */}
              <Grid item xs={12}>
                <PaneSection>
                  <Grid container spacing={4}>
                    <ChipNamespaceContainer
                      container
                      item
                      xs={12}
                      alignItems="flex-start"
                      justify="space-between"
                    >
                      <div>{adapterChip}</div>
                      <InputWrapper>
                        <ReactSelectWrapper
                          label="Namespace"
                          value={namespace}
                          error={namespaceError}
                          options={namespaceList}
                          onChange={this.handleNamespaceChange}
                        />
                      </InputWrapper>
                      <InputWrapper>
                        <ReactSelectWrapper
                          label="Version"
                          value={version}
                          error={versionError}
                          options={versionList}
                          onChange={this.handleVersionChange}
                        />
                      </InputWrapper>
                    </ChipNamespaceContainer>
                    <Grid container spacing={1}>
                      <CardMeshContainer
                        container
                        item
                        lg={!this.extractAddonOperations(2).length ? 12 : 10}
                        xs={12}
                        spacing={2}
                      >
                        {filteredOps.map((val, i) => (
                          <Grid item lg={3} md={4} xs={12} key={`adapter-card-${i}`}>
                            {this.generateCardForCategory(val)}
                          </Grid>
                        ))}
                      </CardMeshContainer>
                      <Grid container item lg={2} xs={12}>
                        <Grid item xs={12} md={4}>
                          {this.generateAddonSwitches(this.extractAddonOperations(2))}
                        </Grid>
                      </Grid>
                    </Grid>
                  </Grid>
                </PaneSection>
              </Grid>
              {/* SECTION 2 */}
              <Grid item xs={12}>
                <PaneSection>
                  {this.renderGrafanaCustomCharts(
                    this.props.grafana.selectedBoardsConfigs,
                    this.props.grafana.grafanaURL,
                    this.props.grafana.grafanaAPIKey,
                  )}
                </PaneSection>
              </Grid>
            </Grid>
          </AdapterSmWrapper>
          <ConfirmationMsg
            open={this.state.modalOpen}
            handleClose={this.handleClose}
            submit={{
              deploy: () => this.submitOp(this.state.category, this.state.selectedOp, false),
              unDeploy: () => this.submitOp(this.state.category, this.state.selectedOp, true),
            }}
            isDelete={this.state.isDeleteOp}
            title={this.state.operationName}
            tab={this.state.isDeleteOp ? ACTIONS.UNDEPLOY : ACTIONS.DEPLOY}
          />
        </React.Fragment>
      </NoSsr>
    );
  }
}

MesheryAdapterPlayComponent.propTypes = {
  adapter: PropTypes.object.isRequired,
};

const mapStateToProps = (st) => {
  const grafana = st.get('grafana').toJS();
  const k8sconfig = st.get('k8sConfig');
  const selectedK8sContexts = st.get('selectedK8sContexts');

  return { grafana: { ...grafana, ts: new Date(grafana.ts) }, selectedK8sContexts, k8sconfig };
};

const mapDispatchToProps = (dispatch) => ({
  updateProgress: bindActionCreators(updateProgress, dispatch),
  setK8sContexts: bindActionCreators(setK8sContexts, dispatch),
  // updateSMIResults: bindActionCreators(updateSMIResults, dispatch),
});

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(withRouter(withNotify(MesheryAdapterPlayComponent)));
