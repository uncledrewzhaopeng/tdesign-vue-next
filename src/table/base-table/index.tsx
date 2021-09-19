import {
  defineComponent, VNode,
} from 'vue';
import throttle from 'lodash/throttle';
import mixins from '../../utils/mixins';
import getLocalReceiverMixins from '../../locale/local-receiver';
import { prefix } from '../../config';
import { flatColumns } from '../util/props-util';
import baseTableProps from '../base-table-props';
import {
  DataType, BaseTableCol, TdBaseTableProps, RowEventContext,
} from '../type';
import TableBody from './table-body';
import TableHeader from './table-header';
import TableColGroup from './col-group';
import Pagination from '../../pagination';
import TLoading from '../../loading';
import { debounce, getScrollDirection, SCROLL_DIRECTION } from '../util/common';
import { PageInfo } from '../../pagination/type';
import { renderTNodeJSX } from '../../utils/render-tnode';
import { EventNameWithKebab } from '../util/interface';
import { emitEvent } from '../../utils/event';

type PageChangeContext = Parameters<TdBaseTableProps['onPageChange']>;

export default defineComponent({
  ...mixins(getLocalReceiverMixins('table')),
  name: `${prefix}-base-table`,
  components: {
    TableBody, TableHeader, TableColGroup, Pagination, TLoading,
  },
  props: {
    ...baseTableProps,
    provider: {
      type: Object,
      default() {
        return {
          renderRows(): void {

          },
        };
      },
    },
  },
  emits: ['page-change', 'scroll-x', 'scroll-y', ...EventNameWithKebab],
  data() {
    return {
      scrollableToLeft: false,
      scrollableToRight: false,
      scrollBarWidth: 0,
      // 用于兼容处理 Pagination 的非受控属性（非受控属性仅有 change 事件变化，无 props 变化，因此只需监听事件）
      defaultCurrent: 0,
      // 用于兼容处理 Pagination 的非受控属性
      defaultPageSize: 0,
    };
  },
  computed: {
    // this.defaultCurrent 属于分页组件抛出的事件参数，非受控的情况也会有该事件触发
    // this.pagination.defaultCurrent 为表格组件传入的非受控属性
    current(): number {
      return this.pagination?.current || this.defaultCurrent || this.pagination?.defaultCurrent;
    },
    pageSize(): number {
      return this.pagination?.pageSize || this.defaultPageSize || this.pagination?.defaultPageSize;
    },
    dataSource(): Array<DataType> {
      if (!this.hasPagination) return this.data.slice(0);
      const { current, pageSize } = this;
      if (this.data.length > pageSize) {
        return this.data.slice((current - 1) * pageSize, current * pageSize);
      }
      return this.data;
    },
    flattedColumns(): Array<BaseTableCol> {
      return flatColumns(this.columns);
    },
    isEmpty(): boolean {
      return (!this.dataSource || this.dataSource.length === 0) && !this.loading;
    },
    hasFixedColumns(): boolean {
      const { columns } = this;
      return columns.some((item: BaseTableCol) => item.fixed === 'right' || item.fixed === 'left');
    },
    hasPagination(): boolean {
      return !!this.pagination;
    },
    isLoading(): boolean {
      return !!this.loading;
    },
    tableHeight(): number {
      const { height } = this;
      if (typeof height === 'string') {
        return parseInt(height, 10);
      }
      return height || 0;
    },
    // 是否固定表头
    fixedHeader(): boolean {
      return this.tableHeight > 0;
    },
    // common class
    commonClass(): Array<string> {
      const {
        bordered, stripe, hover, size, verticalAlign, hasFixedColumns, fixedHeader,
      } = this;
      const commonClass: Array<string> = ['t-table'];
      if (bordered) {
        commonClass.push(`${prefix}-table--bordered`);
      }
      if (stripe) {
        commonClass.push(`${prefix}-table--striped`);
      }
      if (hover) {
        commonClass.push(`${prefix}-table--hoverable`);
      }
      if (this.provider.sortOnRowDraggable) {
        commonClass.push(`${prefix}-table__row--draggable`);
      }
      // table size
      switch (size) {
        case 'small':
          commonClass.push(`${prefix}-size-s`);
          break;
        case 'large':
          commonClass.push(`${prefix}-size-l`);
          break;
        default:
      }
      // table verticalAlign
      switch (verticalAlign) {
        case 'top':
          commonClass.push(`${prefix}-table-valign__top`);
          break;
        case 'bottom':
          commonClass.push(`${prefix}-table-valign__bottom`);
          break;
        default:
      }
      // fixed table
      if (hasFixedColumns) {
        commonClass.push(`${prefix}-table__cell--fixed ${prefix}-table--has-fixed`);
      }
      if (fixedHeader) {
        commonClass.push(`${prefix}-table__header--fixed`);
      }
      return commonClass;
    },
  },
  mounted() {
    if (this.hasFixedColumns) {
      // 首次检查滚动条状态；设置settimeout 是为了等待父组件渲染完
      setTimeout(() => {
        this.checkScrollableToLeftOrRight();
      }, 0);
      this.addWindowResizeEventListener();
    }
    const scrollDiv = document.createElement('div');
    scrollDiv.style.cssText = `
      width: 99px;
      height: 99px;
      overflow: scroll;
      position: absolute;
      top: -9999px;`;
    scrollDiv.classList.add('scrollbar');
    document.body.appendChild(scrollDiv);
    this.scrollBarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth;
    document.body.removeChild(scrollDiv);
  },
  unmounted() {
    window.removeEventListener('resize', debounce(this.checkScrollableToLeftOrRight));
  },
  methods: {
    // 检查是否还可以向左或者向右滚动
    checkScrollableToLeftOrRight() {
      const scrollContainer = this.$refs[this.fixedHeader ? 'scrollBody' : 'tableContent'] as HTMLElement;
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
      this.scrollableToLeft = scrollLeft > 0;
      this.scrollableToRight = scrollLeft + clientWidth < scrollWidth;
    },
    // 窗口大小变化时横向滚动条可能出现或消失，故检查滚动条状态;
    addWindowResizeEventListener() {
      window.addEventListener('resize', debounce(this.checkScrollableToLeftOrRight));
    },
    renderHeader(): VNode {
      const {
        columns, provider: { scopedSlots }, bordered,
      } = this;
      return <TableHeader
              columns={columns}
              bordered={bordered}
            >{scopedSlots}</TableHeader>;
    },
    renderBody(): VNode {
      const {
        provider: { scopedSlots },
      } = this;
      const rowEvents = {};
      EventNameWithKebab.forEach((eventName) => {
        rowEvents[`on${eventName.replace(eventName[0], eventName[0].toUpperCase())}`] = (params: RowEventContext<any>) => {
          emitEvent(this, eventName, params);
        };
      });
      const props = {
        rowKey: this.rowKey,
        data: this.dataSource,
        provider: this.provider,
        columns: this.flattedColumns,
        rowClassName: this.rowClassName,
        current: this.current,
        rowspanAndColspan: this.rowspanAndColspan,
      };
      return (
        <TableBody { ...props } {...rowEvents}>{scopedSlots}</TableBody>
      );
    },
    renderEmptyTable(): VNode {
      const useLocale = !this.empty && !this.$slots.empty;
      return (
        <div class="t-table--empty">
          {useLocale ? this.t(this.locale.empty) : renderTNodeJSX(this, 'empty')}
        </div>
      );
    },
    renderPagination(): VNode {
      const paginationProps = this.pagination;
      return (
        <div class={`${prefix}-table-pagination`}>
          <Pagination
            {...paginationProps}
            {...{
              onChange: (pageInfo: PageInfo) => {
                paginationProps.onChange && paginationProps.onChange(pageInfo);
              },
              onCurrentChange: (current: number, pageInfo: PageInfo) => {
                emitEvent<PageChangeContext>(this, 'page-change', pageInfo, this.dataSource);
                this.defaultCurrent = current;
                paginationProps.onCurrentChange && paginationProps.onCurrentChange(current, pageInfo);
              },
              onPageSizeChange: (pageSize: number, pageInfo: PageInfo) => {
                emitEvent<PageChangeContext>(this, 'page-change', pageInfo, this.dataSource);
                this.defaultPageSize = pageSize;
                paginationProps.onPageSizeChange && paginationProps.onPageSizeChange(pageSize, pageInfo);
              },
            }}
          />
        </div>
      );
    },
    renderTableWithFixedHeader(): Array<VNode> {
      const fixedTable: Array<VNode> = [];
      const {
        columns,
        provider: { asyncLoadingProps },
        tableLayout,
        scrollBarWidth,
        hasFixedColumns,
      } = this;
      // handle scroll
      const handleScroll = throttle((e: Event) => {
        const { target } = e;
        const { scrollLeft } = target as HTMLElement;
        (this.$refs.scrollHeader as HTMLElement).scrollLeft = scrollLeft;
        this.handleScroll(e as WheelEvent);
      }, 10);
      //  fixed table header
      fixedTable.push(<div class={`${prefix}-table__header`} style={{ paddingRight: `${scrollBarWidth}px` }} ref="scrollHeader">
          <table style={{ tableLayout }}>
            <TableColGroup columns={columns} />
            {this.renderHeader()}
          </table>
        </div>);
      const containerStyle = {
        height: isNaN(Number(this.height)) ? this.height : `${Number(this.height)}px`,
        width: hasFixedColumns ? '100%' : undefined,
      };
      // fixed table body
      fixedTable.push(<div
        class={`${prefix}-table__body`}
          style={containerStyle}
          {...asyncLoadingProps}
          ref="scrollBody"
          onScroll={handleScroll}
        >
          <table style={{ tableLayout }}>
            <TableColGroup columns={columns} />
            {this.renderBody()}
            {this.renderFooter()}
          </table>
        </div>);
      return fixedTable;
    },
    renderLoadingContent(): VNode {
      return renderTNodeJSX(this, 'loading', <div />);
    },
    renderFooter() {
      const {
        flattedColumns: {
          length: colspan,
        }, isEmpty,
      } = this;
      let footerContent: VNode;
      if (isEmpty) {
        footerContent = this.renderEmptyTable();
      } else {
        footerContent = renderTNodeJSX(this, 'footer');
      }
      return footerContent ? <tfoot>
                <tr>
                  <td colspan={colspan}>
                    {footerContent}
                  </td>
                </tr>
              </tfoot> : null;
    },
    handleScroll(e: WheelEvent) {
      this.checkScrollableToLeftOrRight();
      const { scrollLeft, scrollTop } = e.target as HTMLElement;
      const direction = getScrollDirection(scrollLeft, scrollTop);
      if (direction !== SCROLL_DIRECTION.UNKNOWN) {
        const scrollListenerName = direction === SCROLL_DIRECTION.X ? 'scroll-x' : 'scroll-y';
        emitEvent(this, scrollListenerName, {
          e,
        });
      }
    },
  },
  render() {
    const {
      hasPagination,
      commonClass,
      fixedHeader,
      columns,
      tableLayout,
      isLoading,
    } = this;
    const body: Array<VNode> = [];
    // colgroup
    const tableColGroup = <TableColGroup columns={columns} />;
    // header
    const tableHeader = this.renderHeader();
    // table content
    const tableContent: Array<VNode> = [tableColGroup, tableHeader];
    // fixed table
    let fixedTableContent: Array<VNode>;
    // loading
    if (fixedHeader) {
      fixedTableContent = this.renderTableWithFixedHeader();
    } else {
      // table body
      tableContent.push(this.renderBody());
      tableContent.push(this.renderFooter());
    }
    // 渲染分页
    if (hasPagination) {
      body.push(this.renderPagination());
    }
    const handleScroll = throttle(this.handleScroll, 100);
    const maxHeight = isNaN(Number(this.maxHeight)) ? this.maxHeight : `${Number(this.maxHeight)}px`;
    const tableContentClass = [`${prefix}-table-content`, {
      [`${prefix}-table-content--scrollable-to-right`]: this.scrollableToRight,
      [`${prefix}-table-content--scrollable-to-left`]: this.scrollableToLeft,
    }];
    return (
      <div class={commonClass}>
        <TLoading loading={isLoading} showOverlay text={this.renderLoadingContent}>
          <div ref='tableContent' class={tableContentClass} style={{ overflow: 'auto', maxHeight }} onScroll={handleScroll}>
            {fixedTableContent || <table style={{ tableLayout }}>{tableContent}</table>}
          </div>
          {body}
        </TLoading>
      </div>
    );
  },
});