// SPDX-License-Identifier: MIT

/*
_DESCRIPTION_
*/

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB)
        external
        returns (address pair);
}

interface IUniswapV2Router02 {
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
}

// _NAME_ contract
contract _TICKER_ is Context, Ownable, IERC20 {

    /**
     * @dev ERC-20 Variables
     */
    mapping(address => uint256) private _balances;

    mapping(address => mapping(address => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private constant _name = "_NAME_";
    string private constant _symbol = "_TICKER_";

    //tax info
    struct TaxInfo {
        uint32 burnTaxBuy;
        uint32 burnTaxSell;
        uint32 lpTaxBuy;
        uint32 lpTaxSell;
        uint32 marketingTaxBuy;
        uint32 marketingTaxSell;
    }

    TaxInfo public taxInfo = TaxInfo({
        burnTaxBuy: _BURN_TAX_BUY_,
        burnTaxSell: _BURN_TAX_SELL_,
        lpTaxBuy: _LP_TAX_BUY_,
        lpTaxSell: _LP_TAX_SELL_,
        marketingTaxBuy: _MARKETING_TAX_BUY_,
        marketingTaxSell: _MARKETING_TAX_SELL_
    });

    mapping(address => bool) private _isExcludedFromFee;
    address public marketingWallet;

    uint256 private constant INIT_SUPPLY = _SUPPLY_;
    uint256 private maxWalletSize = INIT_SUPPLY / _MAX_WALLET_RATIO_;

    IUniswapV2Router02 public uniswapV2Router;
    address public uniswapV2Pair;

    //enable trading
    bool public tradingOpen;
    
    bool private inSwap;
    bool private swapEnabled = true;
    uint256 public _swapTokensAtAmount = INIT_SUPPLY / _CLOG_RATIO_;
    modifier lockTheSwap {
        inSwap = true;
        _;
        inSwap = false;
    }
    modifier onlyAuthorized {
        require(msg.sender == owner() || msg.sender == _OPERATOR_WALLET_);
        _;
    }

    constructor() Ownable(msg.sender) {
        // create uniswap pair
        IUniswapV2Router02 _uniswapV2Router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
        uniswapV2Router = _uniswapV2Router;
        uniswapV2Pair = IUniswapV2Factory(_uniswapV2Router.factory())
            .createPair(address(this), _uniswapV2Router.WETH());
        
        // set mw, default fee exclusions
        marketingWallet = msg.sender;
        _isExcludedFromFee[msg.sender] = true;
        _isExcludedFromFee[address(this)] = true;
            
        // mint init supply
        _mint(msg.sender, INIT_SUPPLY);
    }

    /**
     * @dev fallback for receiving ETH - needed for swapping marketing tax tokens to ETH
     */
    receive() external payable {}

    /**
     * @notice ERC-20 Functions
     */
    /**
     * @dev Returns the name of the token.
     */
    function name() public pure returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public pure returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public pure returns (uint8) {
        return 9;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view override returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account)
        public
        view
        override
        returns (uint256)
    {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        _transfer(_msgSender(), to, amount);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount)
        public
        override
        returns (bool)
    {
        _approve(_msgSender(), spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(address spender, uint256 addedValue)
        public
        returns (bool)
    {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        returns (bool)
    {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(
            currentAllowance >= subtractedValue,
            "ERC20: decreased allowance below zero"
        );
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    /**
     * @dev Moves `amount` of tokens from `from` to `to`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     */
    function _transfer(
        address from,
        address to,
        uint256 amount
    ) private {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(amount > 0, "Transfer amount must be greater than zero");

        if (from != owner() && to != owner()) {
            //Trade start check
            if (!tradingOpen) {
                require(from == owner(), "TOKEN: This account cannot send tokens until trading is open");
            }
            //Max wallet check
            if (to != uniswapV2Pair) {
                require(balanceOf(to) + amount < maxWalletSize, "TOKEN: Balance exceeds wallet size");
            }
            //Swap and send tax tokens to marketing wallet only on sells
            uint256 contractTokenBalance = balanceOf(address(this));
            if (contractTokenBalance >= _swapTokensAtAmount && !inSwap && to == uniswapV2Pair && swapEnabled && !_isExcludedFromFee[from] && !_isExcludedFromFee[to]) {
                swapTokensForETH(contractTokenBalance);
                if (address(this).balance > 0) {
                    sendETHToFee(address(this).balance);
                }
            }
        }

        uint256 taxAmountMarketing;
        uint256 taxAmountBurn;
        uint256 taxAmountLP;
        if (!(_isExcludedFromFee[from] || _isExcludedFromFee[to]) && !(from != uniswapV2Pair && to != uniswapV2Pair)) {
            if (from == uniswapV2Pair && to != address(uniswapV2Router)) {
                // buy
                taxAmountMarketing = Math.mulDiv(amount, uint256(taxInfo.marketingTaxBuy), 1000);
                taxAmountBurn = Math.mulDiv(amount, uint256(taxInfo.burnTaxBuy), 1000);
                taxAmountLP = Math.mulDiv(amount, uint256(taxInfo.lpTaxBuy), 1000);
            } else if (to == uniswapV2Pair && from != address(uniswapV2Router)) {
                // sell
                taxAmountMarketing = Math.mulDiv(amount, uint256(taxInfo.marketingTaxSell), 1000);
                taxAmountBurn = Math.mulDiv(amount, uint256(taxInfo.burnTaxSell), 1000);
                taxAmountLP = Math.mulDiv(amount, uint256(taxInfo.lpTaxSell), 1000);
            }
        }
        
        uint256 amountAfterTax;
        _balances[from] -= amount;
        unchecked {
            _totalSupply -= taxAmountBurn;
            amountAfterTax = amount - (taxAmountMarketing + taxAmountBurn + taxAmountLP);
            _balances[to] += amountAfterTax;
            _balances[address(this)] += taxAmountMarketing;
            _balances[uniswapV2Pair] += taxAmountLP;
        }
        
        emit Transfer(from, to, amountAfterTax);
    }

    /** @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount) private {
        require(account != address(0), "ERC20: mint to the zero address");
        _totalSupply += amount;
        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _balances[account] += amount;
        }
        emit Transfer(address(0), account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) private {
        require(account != address(0), "ERC20: burn from the zero address");

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _balances[account] = accountBalance - amount;
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalSupply -= amount;
        }

        emit Transfer(account, address(0), amount);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) private {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) private {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(
                currentAllowance >= amount,
                "ERC20: insufficient allowance"
            );
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    /**
     * @dev Destroys `amount` tokens from the caller.
     *
     * See {ERC20-_burn}.
     */
    function burn(uint256 amount) public {
        _burn(_msgSender(), amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, deducting from the caller's
     * allowance.
     *
     * See {ERC20-_burn} and {ERC20-allowance}.
     *
     * Requirements:
     *
     * - the caller must have allowance for ``accounts``'s tokens of at least
     * `amount`.
     */
    function burnFrom(address account, uint256 amount) public {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    /**
     * @notice Gets tax info
     */
    function getTaxInfo() external view returns (TaxInfo memory) {
        return taxInfo;
    }

    function setTaxes(
        uint32 _burnTaxBuy,
        uint32 _burnTaxSell,
        uint32 _lpTaxBuy,
        uint32 _lpTaxSell,
        uint32 _marketingTaxBuy,
        uint32 _marketingTaxSell
    ) external onlyOwner {
        taxInfo = TaxInfo({
            burnTaxBuy: _burnTaxBuy,
            burnTaxSell: _burnTaxSell,
            lpTaxBuy: _lpTaxBuy,
            lpTaxSell: _lpTaxSell,
            marketingTaxBuy: _marketingTaxBuy,
            marketingTaxSell: _marketingTaxSell
        });
    }

    function excludeFromFees(address[] accounts, bool isExcluded)
        external
        onlyOwner
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            _isExcludedFromFee[accounts[i]] = isExcluded;
        }
    }

    function setMarketingWallet(address _marketingWallet) external onlyOwner {
        marketingWallet = _marketingWallet;
    }

    function setMaxWalletSize(uint256 _maxWalletSize) external onlyOwner {
        maxWalletSize = _maxWalletSize;
    }

    function removeLimits() external onlyOwner {
        maxWalletSize = _totalSupply;
    }

    function swapTokensForETH(uint256 tokenAmount) private lockTheSwap {
        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = uniswapV2Router.WETH();
        _approve(address(this), address(uniswapV2Router), tokenAmount);
        uniswapV2Router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            tokenAmount,
            0,
            path,
            address(this),
            block.timestamp
        );
    }

    function sendETHToFee(uint256 amount) private {
        (bool success, ) = payable(marketingWallet).call{value: amount}("");
        require(success, "Unable to send ETH to marketing wallet");
    }

    function openTrading() external onlyAuthorized {
        tradingOpen = true;
    }

    function setSwapEnabled(bool _enabled) external onlyOwner {
        swapEnabled = _enabled;
    }

    function setSwapTokensAtAmount(uint256 _newSwapTokensAtAmount) external onlyOwner {
        _swapTokensAtAmount = _newSwapTokensAtAmount;
    }

    function manualswap() external {
        require(_msgSender() == owner() || _msgSender() == marketingWallet);
        swapTokensForETH(balanceOf(address(this)));
    }

    function manualsend() external {
        require(_msgSender() == owner() || _msgSender() == marketingWallet);
        sendETHToFee(address(this).balance);
    }

}